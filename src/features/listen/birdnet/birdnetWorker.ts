/**
 * BirdNET worker: runs the v2.4 TF.js model off the main thread. Created only when on-device
 * call identification is used, so neither TF.js nor this file is in the app's main bundle.
 */
import { createBirdnetHandler, type BirdnetReply, type BirdnetRequest } from './protocol';
import { loadTfModel } from './tfModel';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<BirdnetRequest>) => void) | null;
  postMessage(message: BirdnetReply): void;
};

const handle = createBirdnetHandler(loadTfModel);

scope.onmessage = (e) => {
  void handle(e.data).then((reply) => scope.postMessage(reply));
};
