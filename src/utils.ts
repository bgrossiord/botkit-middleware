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

const debug = require('debug')('watson-middleware:utils');
import { Storage } from 'botbuilder';
import AssistantV2 = require('ibm-watson/assistant/v2');
import {
  MessageContext,
  MessageParams,
  MessageResponse,
} from 'ibm-watson/assistant/v2';

const storagePrefix = 'user.';

export async function readContext(
  userId: string,
  storage: Storage,
): Promise<MessageContext | null> {
  const itemId = storagePrefix + userId;

  try {
    const result = await storage.read([itemId]);
    if (typeof result[itemId] !== 'undefined' && result[itemId].context) {
      debug(
        'User: %s, Context: %s',
        userId,
        JSON.stringify(result[itemId].context, null, 2),
      );
      return result[itemId].context;
    }
  } catch (err) {
    debug('User: %s, read context error: %s', userId, err);
  }
  return null;
}

export async function updateContext(
  userId: string,
  storage: Storage,
  response: MessageResponse,
): Promise<MessageResponse> {
  const itemId = storagePrefix + userId;

  let userData: any = {};
  try {
    const result = await storage.read([itemId]);
    if (typeof result[itemId] !== 'undefined') {
      debug(
        'User: %s, Data: %s',
        userId,
        JSON.stringify(result[itemId], null, 2),
      );
      userData = result[itemId];
    }
  } catch (err) {
    debug('User: %s, read context error: %s', userId, err);
  }

  userData.id = userId;
  userData.context = response.context;
  let changes = {};
  changes[itemId] = userData;
  await storage.write(changes);

  return response;
}

export async function postMessage(
  conversation: AssistantV2,
  payload: MessageParams,
): Promise<MessageResponse> {
  debug('Assistant Request: %s', JSON.stringify(payload, null, 2));
  const response = await conversation.message(payload);
  debug('Assistant Response: %s', JSON.stringify(response, null, 2));
  return response.result;
}
