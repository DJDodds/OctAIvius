declare module "ws" {
  import { EventEmitter } from "events";
  export type RawData = string | Buffer | ArrayBuffer | Buffer[];
  export default class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readyState: number;
    constructor(address: string, protocols?: string | string[], options?: any);
    send(data: any, cb?: (err?: Error) => void): void;
    close(): void;
    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: RawData) => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
  }
}
