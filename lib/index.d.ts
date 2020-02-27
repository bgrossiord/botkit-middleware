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
import Botkit = require('botkit');
import AssistantV2 = require('ibm-watson/assistant/v2');
import { MessageParams, MessageResponse } from 'ibm-watson/assistant/v2';
import { MessageContext } from 'ibm-watson/assistant/v2';
import { BotkitMessage } from 'botkit';
/**
 * @deprecated please use AssistantV2.MessageParams instead
 */
export declare type Payload = MessageParams;
export declare type BotkitWatsonMessage = BotkitMessage & {
    watsonData?: MessageResponse;
    watsonError?: string;
};
export interface ContextDelta {
    [index: string]: any;
}
export declare class WatsonMiddlewareV2 {
    private conversation;
    private storage;
    private assistantId;
    private sessionId;
    private inactivityTimeOut;
    private readonly minimumConfidence;
    private expiringSession;
    private readonly ignoreType;
    constructor(version: string, apikey: string, url: string, assistantId: string, inactivityTimeOut?: number, minimumConfidence?: number);
    hear(patterns: string[], message: Botkit.BotkitMessage): boolean;
    createSession(conversation: AssistantV2, assistantId: string): number;
    before(message: Botkit.BotkitMessage, payload: MessageParams): Promise<MessageParams>;
    after(message: Botkit.BotkitMessage, response: MessageResponse): Promise<MessageResponse>;
    sendToWatson(bot: Botkit.BotWorker, message: Botkit.BotkitMessage, contextDelta: ContextDelta): Promise<void>;
    checkExiringSession(): void;
    receive(bot: Botkit.BotWorker, message: Botkit.BotkitMessage): Promise<void>;
    interpret(bot: Botkit.BotWorker, message: Botkit.BotkitMessage): Promise<void>;
    readContext(user: string): Promise<MessageContext>;
    updateContext(user: string, response: MessageResponse): Promise<MessageResponse>;
    deleteUserData(sessionId: string): Promise<void>;
}
