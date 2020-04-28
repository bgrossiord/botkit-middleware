/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright 2016-2019 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const debug = require('debug')('watson-middleware:index');
import Botkit = require('botkit');
import AssistantV2 = require('ibm-watson/assistant/v2');
import { MessageParams, MessageResponse } from 'ibm-watson/assistant/v2';
import { MessageContext } from 'ibm-watson/assistant/v2';
import { Storage } from 'botbuilder';
import { readContext, updateContext, postMessage } from './utils';
import deepMerge = require('deepmerge');
import { BotkitMessage } from 'botkit';
import { IamAuthenticator } from 'ibm-watson/auth';

/**
 * @deprecated please use AssistantV2.MessageParams instead
 */
export type Payload = MessageParams;

export type BotkitWatsonMessage = BotkitMessage & {
  watsonData?: MessageResponse;
  watsonError?: string;
};

export interface ContextDelta {
  [index: string]: any;
}

export class WatsonMiddlewareV2 {
  private conversation: AssistantV2;
  private storage: Storage;
  private assistantId: string;
  private sessionId: string;
  private inactivityTimeOut: number = 5;
  private readonly minimumConfidence: number = 0.5;
  private expiringSession: number;
  // These are initiated by Slack itself and not from the end-user. Won't send these to WCS.
  private readonly ignoreType = ['presence_change', 'reconnect_url'];

  public constructor(
    version: string,
    apikey: string,
    url: string,
    assistantId: string,
    inactivityTimeOut?: number,
    minimumConfidence?: number,
  ) {
    this.assistantId = assistantId;
    if (minimumConfidence) {
      this.minimumConfidence = minimumConfidence;
    }
    if (inactivityTimeOut) {
      this.inactivityTimeOut = inactivityTimeOut;
    }
    debug(
      'Creating Assistant object with parameters: ' +
      JSON.stringify(arguments, null, 2),
    );
    this.conversation = new AssistantV2({
      version: version,
      authenticator: new IamAuthenticator({
        apikey: apikey,
      }),
      url: url,
    });
  }

  public hear(patterns: string[], message: Botkit.BotkitMessage): boolean {
    if (message.watsonData && message.watsonData.intents) {
      for (let p = 0; p < patterns.length; p++) {
        for (let i = 0; i < message.watsonData.intents.length; i++) {
          if (
            message.watsonData.intents[i].intent === patterns[p] &&
            message.watsonData.intents[i].confidence >= this.minimumConfidence
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public async createSession(): Promise<number> {
    try {
      var sessionResp = await this.conversation.createSession({
        assistantId: this.assistantId
      });
      this.sessionId = sessionResp.result.session_id;
      console.debug("Assistant sessionId :" + this.sessionId);
      return Date.now() + this.inactivityTimeOut * 60 * 1000;
    } catch (err) {
      throw new Error(
        'Failed to renew session error code' +
        err.code +
        ', message: ' +
        err.message,
      );
    }
  }

  public before(
    message: Botkit.BotkitMessage,
    payload: MessageParams,
  ): Promise<MessageParams> {
    return Promise.resolve(payload);
  }

  public after(
    message: Botkit.BotkitMessage,
    response: MessageResponse,
  ): Promise<MessageResponse> {
    return Promise.resolve(response);
  }

  public async sendToWatson(
    bot: Botkit.BotWorker,
    message: Botkit.BotkitMessage,
    contextDelta: ContextDelta,
  ): Promise<void> {
    if (
      (!message.text && message.type !== 'welcome') ||
      this.ignoreType.indexOf(message.type) !== -1 ||
      message.reply_to ||
      message.bot_id
    ) {
      // Ignore messages initiated by Slack. Reply with dummy output object
      message.watsonData = {
        output: {
          text: [],
        },
      };
      return;
    }

    this.storage = bot.controller.storage;

    try {
      const userContext = await readContext(message.user, this.storage);
      await this.checkExiringSession();
      const payload: MessageParams = {
        // eslint-disable-next-line @typescript-eslint/camelcase
        assistantId: this.assistantId,
        sessionId: this.sessionId,
      };
      if (message.text) {
        // text can not contain the following characters: tab, new line, carriage return.
        const sanitizedText = message.text.replace(/[\r\n\t]/g, ' ');
        payload.input = {
          text: sanitizedText,
        };
      }
      if (userContext) {
        payload.context = userContext;
      }
      if (contextDelta) {
        if (!userContext) {
          //nothing to merge, this is the first context
          payload.context = contextDelta;
        } else {
          payload.context = deepMerge(payload.context, contextDelta);
        }
      }
      /*if (
        payload.context &&
        payload.context.assistantId &&
        payload.context.assistantId.length === 36
      ) {
        // eslint-disable-next-line @typescript-eslint/camelcase
        payload.workspaceId = payload.context.workspaceId;
      }*/

      const watsonRequest = await this.before(message, payload);
      let watsonResponse = await postMessage(this.conversation, watsonRequest);
      /*if (typeof watsonResponse.output.error === 'string') {
        debug('Error: %s', watsonResponse.output.error);
        message.watsonError = watsonResponse.output.error;
      }*/
      watsonResponse = await this.after(message, watsonResponse);

      message.watsonData = watsonResponse;
      await updateContext(message.user, this.storage, watsonResponse);
    } catch (error) {
      message.watsonError = error;
      debug(
        'Error: %s',
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      );
    }
  }

  public async checkExiringSession(): Promise<void> {
    if (this.expiringSession == null || this.expiringSession < Date.now()) {
      this.expiringSession = await this.createSession();
    }
  }

  public async receive(
    bot: Botkit.BotWorker,
    message: Botkit.BotkitMessage,
  ): Promise<void> {
    return this.sendToWatson(bot, message, null);
  }

  public async interpret(
    bot: Botkit.BotWorker,
    message: Botkit.BotkitMessage,
  ): Promise<void> {
    return this.sendToWatson(bot, message, null);
  }

  public async readContext(user: string): Promise<MessageContext> {
    if (!this.storage) {
      throw new Error(
        'readContext is called before the first this.receive call',
      );
    }
    return readContext(user, this.storage);
  }

  public async updateContext(
    user: string,
    response: MessageResponse,
  ): Promise<MessageResponse> {
    if (!this.storage) {
      throw new Error(
        'updateContext is called before the first this.receive call',
      );
    }
    return updateContext(user, this.storage, response);
  }

  public async deleteUserData(sessionId: string) {
    const params = {
      sessionId: sessionId,
      return_response: true,
      assistantId: this.assistantId,
    };
    await this.checkExiringSession();
    try {
      const response = await this.conversation.deleteSession(params);
      debug('deleteUserData response', response);
    } catch (err) {
      throw new Error(
        'Failed to delete user data, response code: ' +
        err.code +
        ', message: ' +
        err.message,
      );
    }
  }
}
