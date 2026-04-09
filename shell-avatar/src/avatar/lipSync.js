/**
 * LipSync — drives ParamMouthOpenY from audio output amplitude.
 *
 * Usage:
 *   const ls = new LipSync(avatar);
 *   ls.start(audioElement);   // while speaking
 *   ls.stop();                // when speech ends
 */

class LipSync {
  constructor(avatar) {
    this.avatar = avatar;
    this._audioCtx = null;
    this._analyser = null;
    this._source = null;
    this._frameId = null;
    this._dataArray = null;
  }

  /**
   * Start lip sync from a Web Audio node or AudioElement.
   */
  start(sourceNode) {
    this.stop();

    if (!this._audioCtx) {
      this._audioCtx = new AudioContext();
    }

    this._analyser = this._audioCtx.createAnalyser();
    this._analyser.fftSize = 256;
    this._analyser.smoothingTimeConstant = 0.6;

    if (sourceNode instanceof AudioNode) {
      this._source = sourceNode;
    } else {
      // Assume MediaElementSource or raw AudioElement
      this._source = this._audioCtx.createMediaElementSource(sourceNode);
    }

    this._source.connect(this._analyser);
    this._analyser.connect(this._audioCtx.destination);

    this._dataArray = new Float32Array(this._analyser.frequencyBinCount);
    this._loop();
  }

  stop() {
    if (this._frameId) {
      cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }
    if (this._source) {
      try { this._source.disconnect(); } catch (_) {}
      this._source = null;
    }
    this._analyser = null;
    this.avatar.setMouthOpen(0);
  }

  _loop() {
    this._frameId = requestAnimationFrame(() => this._loop());

    if (!this._analyser || !this._dataArray) return;

    this._analyser.getFloatTimeDomainData(this._dataArray);

    // RMS amplitude
    let sum = 0;
    for (let i = 0; i < this._dataArray.length; i++) {
      sum += this._dataArray[i] ** 2;
    }
    const rms = Math.sqrt(sum / this._dataArray.length);

    // Map RMS to mouth open: scale up (speech RMS is typically 0.01–0.3)
    const mouthOpen = Math.min(1, rms * 8);
    this.avatar.setMouthOpen(mouthOpen);
  }
}

module.exports = { LipSync };
