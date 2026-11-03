/*
 * 再生管理：再生 / 停止 / 再実行 / 再生位置 / 繰り返し（1回・ループ・往復）
 */
(function () {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const LOOP_WAIT = 0.9; // ループ・往復の折り返しで止まって見せる秒数

  Lab.Timeline = class {
    constructor() {
      this.time = 0;
      this.duration = 3;
      this.playing = false;
      this.loop = 'once';
      this.dir = 1;
      this.wait = 0;
    }

    get progress() {
      return clamp(this.time / this.duration, 0, 1);
    }

    setDuration(d) {
      const p = this.progress;
      this.duration = d;
      this.time = p * d;
    }

    play() {
      if (this.loop === 'once' && this.time >= this.duration) this.time = 0;
      this.dir = this.loop === 'pingpong' ? this.dir : 1;
      this.playing = true;
    }

    pause() {
      this.playing = false;
    }

    toggle() {
      this.playing ? this.pause() : this.play();
    }

    restart() {
      this.time = 0;
      this.dir = 1;
      this.wait = 0;
      this.playing = true;
    }

    seek(p) {
      this.time = clamp(p, 0, 1) * this.duration;
      this.wait = 0;
    }

    update(dt) {
      if (!this.playing) return;
      if (this.wait > 0) {
        this.wait -= dt;
        if (this.wait <= 0 && this.loop === 'loop') this.time = 0;
        return;
      }
      this.time += dt * this.dir;
      if (this.time >= this.duration && this.dir > 0) {
        this.time = this.duration;
        if (this.loop === 'once') this.playing = false;
        else if (this.loop === 'loop') this.wait = LOOP_WAIT;
        else { this.dir = -1; this.wait = LOOP_WAIT; }
      } else if (this.time <= 0 && this.dir < 0) {
        this.time = 0;
        this.dir = 1;
        this.wait = LOOP_WAIT;
      }
    }
  };
})();
