"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const debug = require('debug')('watson-middleware:index');
const AssistantV2 = require("ibm-watson/assistant/v2");
const utils_1 = require("./utils");
const deepMerge = require("deepmerge");
const auth_1 = require("ibm-watson/auth");
class WatsonMiddlewareV2 {
    constructor(version, apikey, url, assistantId, inactivityTimeOut, minimumConfidence) {
        this.inactivityTimeOut = 5;
        this.minimumConfidence = 0.5;
        // These are initiated by Slack itself and not from the end-user. Won't send these to WCS.
        this.ignoreType = ['presence_change', 'reconnect_url'];
        this.assistantId = assistantId;
        if (minimumConfidence) {
            this.minimumConfidence = minimumConfidence;
        }
        if (inactivityTimeOut) {
            this.inactivityTimeOut = inactivityTimeOut;
        }
        debug('Creating Assistant object with parameters: ' +
            JSON.stringify(arguments, null, 2));
        this.conversation = new AssistantV2({
            version: version,
            authenticator: new auth_1.IamAuthenticator({
                apikey: apikey,
            }),
            url: url,
        });
    }
    hear(patterns, message) {
        if (message.watsonData && message.watsonData.intents) {
            for (let p = 0; p < patterns.length; p++) {
                for (let i = 0; i < message.watsonData.intents.length; i++) {
                    if (message.watsonData.intents[i].intent === patterns[p] &&
                        message.watsonData.intents[i].confidence >= this.minimumConfidence) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    createSession() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                var sessionResp = yield this.conversation.createSession({
                    assistantId: this.assistantId
                });
                this.sessionId = sessionResp.result.session_id;
                console.debug("Assistant sessionId :" + this.sessionId);
                return Date.now() + this.inactivityTimeOut * 60 * 1000;
            }
            catch (err) {
                throw new Error('Failed to renew session error code' +
                    err.code +
                    ', message: ' +
                    err.message);
            }
        });
    }
    before(message, payload) {
        return Promise.resolve(payload);
    }
    after(message, response) {
        return Promise.resolve(response);
    }
    sendToWatson(bot, message, contextDelta) {
        return __awaiter(this, void 0, void 0, function* () {
            if ((!message.text && message.type !== 'welcome') ||
                this.ignoreType.indexOf(message.type) !== -1 ||
                message.reply_to ||
                message.bot_id) {
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
                const userContext = yield utils_1.readContext(message.user, this.storage);
                yield this.checkExiringSession();
                const payload = {
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
                    }
                    else {
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
                const watsonRequest = yield this.before(message, payload);
                let watsonResponse = yield utils_1.postMessage(this.conversation, watsonRequest);
                /*if (typeof watsonResponse.output.error === 'string') {
                  debug('Error: %s', watsonResponse.output.error);
                  message.watsonError = watsonResponse.output.error;
                }*/
                watsonResponse = yield this.after(message, watsonResponse);
                message.watsonData = watsonResponse;
                yield utils_1.updateContext(message.user, this.storage, watsonResponse);
            }
            catch (error) {
                message.watsonError = error;
                debug('Error: %s', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            }
        });
    }
    checkExiringSession() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.expiringSession == null || this.expiringSession < Date.now()) {
                this.expiringSession = yield this.createSession();
            }
        });
    }
    receive(bot, message) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sendToWatson(bot, message, null);
        });
    }
    interpret(bot, message) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.sendToWatson(bot, message, null);
        });
    }
    readContext(user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.storage) {
                throw new Error('readContext is called before the first this.receive call');
            }
            return utils_1.readContext(user, this.storage);
        });
    }
    updateContext(user, response) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.storage) {
                throw new Error('updateContext is called before the first this.receive call');
            }
            return utils_1.updateContext(user, this.storage, response);
        });
    }
    deleteUserData(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                sessionId: sessionId,
                return_response: true,
                assistantId: this.assistantId,
            };
            yield this.checkExiringSession();
            try {
                const response = yield this.conversation.deleteSession(params);
                debug('deleteUserData response', response);
            }
            catch (err) {
                throw new Error('Failed to delete user data, response code: ' +
                    err.code +
                    ', message: ' +
                    err.message);
            }
        });
    }
}
exports.WatsonMiddlewareV2 = WatsonMiddlewareV2;
//# sourceMappingURL=index.js.map