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
import { Storage } from 'botbuilder';
import AssistantV2 = require('ibm-watson/assistant/v2');
import { MessageContext, MessageParams, MessageResponse } from 'ibm-watson/assistant/v2';
export declare function readContext(userId: string, storage: Storage): Promise<MessageContext | null>;
export declare function updateContext(userId: string, storage: Storage, response: MessageResponse): Promise<MessageResponse>;
export declare function postMessage(conversation: AssistantV2, payload: MessageParams): Promise<MessageResponse>;
