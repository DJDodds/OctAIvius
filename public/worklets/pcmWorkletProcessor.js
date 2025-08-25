class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._rmsWindow = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch0 = input[0];
    // Compute RMS on current frame
    let sum = 0;
    for (let i = 0; i < ch0.length; i++) {
      const v = ch0[i] || 0;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / Math.max(1, ch0.length));
    // Copy buffer to transferable
    const buf = new Float32Array(ch0.length);
    buf.set(ch0);
    this.port.postMessage({ type: 'frame', buffer: buf.buffer, rms }, [buf.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
