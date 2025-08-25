// AudioWorklet processor for low-latency mic capture
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._frameSize = 2048; // matches previous ScriptProcessor chunk
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    if (!ch0) return true;
    // Compute RMS for UI
    let sum = 0;
    for (let i = 0; i < ch0.length; i++) {
      const v = ch0[i] || 0;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / Math.max(1, ch0.length));
    // Transfer samples buffer to main thread (copy)
    const buf = new Float32Array(ch0.length);
    buf.set(ch0);
    this.port.postMessage({ type: 'frame', rms, buffer: buf.buffer }, [buf.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor);
