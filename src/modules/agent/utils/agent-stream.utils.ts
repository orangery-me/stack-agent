import { Observable, Subscriber } from 'rxjs';
import { AskAgentStreamChunk } from '../shared/agent.types';

export function createAsyncStream(
  executor: (subscriber: Subscriber<AskAgentStreamChunk>) => Promise<void>
): Observable<AskAgentStreamChunk> {
  return new Observable((subscriber) => {
    void executor(subscriber).catch((error) => subscriber.error(error));
  });
}

export function pipeTextEmitterToSubscriber(
  emitter: NodeJS.EventEmitter,
  subscriber: Subscriber<AskAgentStreamChunk>
): void {
  const onToken = (token: string) => subscriber.next({ chunk: token, done: false });
  const onEnd = () => {
    subscriber.next({ chunk: '', done: true });
    subscriber.complete();
  };
  const onError = (error: Error) => subscriber.error(error);

  emitter.on('token', onToken);
  emitter.on('end', onEnd);
  emitter.on('error', onError);

  subscriber.add(() => {
    emitter.removeListener('token', onToken);
    emitter.removeListener('end', onEnd);
    emitter.removeListener('error', onError);
  });
}
