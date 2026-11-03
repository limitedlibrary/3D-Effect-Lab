/*
 * 右パネル（演出の調整）と左パネル（プリセット一覧）の組み立て
 * 右パネルは params.js の paramSchema から自動生成されます。
 */
(function () {
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  Lab.el = el;

  Lab.UI = class {
    constructor(root, handlers) {
      this.root = root;
      this.h = handlers;
      this.controls = {};
      this.sections = {};
      this.build();
    }

    build() {
      for (const g of ['target', 'rules', 'env', 'shape', 'motion', 'effect', 'look']) {
        const sec = el('section', 'group');
        const title = el('h2', null, Lab.groupLabels[g]);
        sec.appendChild(title);
        this.sections[g] = { sec, title };
        for (const def of Lab.paramSchema.filter((d) => d.group === g)) {
          const c = this.makeControl(def);
          this.controls[def.key] = c;
          sec.appendChild(c.el);
        }
        if (g === 'shape' || g === 'target') {
          const b = el('button', 'ghost wide', '🎲 ばらつきを変える');
          b.type = 'button';
          b.title = g === 'shape' ? '破片の配置や散らばり方の乱数を変えます' : '最初の配置や傾きの乱数を変えます';
          b.addEventListener('click', () => this.h.reseed());
          sec.appendChild(b);
          if (g === 'target') this.simReseed = b;
        }
        this.root.appendChild(sec);
      }
    }

    makeControl(def) {
      const wrap = el('div', 'ctrl');
      const head = el('div', 'ctrl-head');
      const label = el('label', null, def.label);
      const val = el('span', 'val');
      head.append(label, val);
      wrap.appendChild(head);
      const change = (v) => this.h.change(def.key, v);
      let set;

      switch (def.type) {
        case 'segment': {
          const seg = el('div', 'seg');
          const btns = def.options.map(([v, l]) => {
            const b = el('button', null, l);
            b.type = 'button';
            b.addEventListener('click', () => change(v));
            seg.appendChild(b);
            return [v, b];
          });
          wrap.appendChild(seg);
          set = (v) => btns.forEach(([k, b]) => b.classList.toggle('on', k === v));
          break;
        }
        case 'range': {
          const input = el('input');
          input.type = 'range';
          input.min = def.min; input.max = def.max; input.step = def.step;
          input.addEventListener('input', () => change(parseFloat(input.value)));
          const ends = el('div', 'ends');
          ends.append(el('span', null, def.minLabel), el('span', null, def.maxLabel));
          wrap.append(input, ends);
          set = (v) => {
            if (document.activeElement !== input) input.value = v;
            val.textContent = def.format ? def.format(v) : '';
            input.style.setProperty('--fill', ((v - def.min) / (def.max - def.min)) * 100 + '%');
          };
          break;
        }
        case 'textarea': {
          const input = el('textarea', 'text');
          input.rows = 2;
          input.maxLength = def.maxLength || 120;
          input.spellcheck = false;
          // 入力が落ち着いてから形を作り直す（日本語入力の変換中は待つ）
          let timer, composing = false;
          const commit = () => { clearTimeout(timer); timer = setTimeout(() => change(input.value), 500); };
          input.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
          input.addEventListener('compositionend', () => { composing = false; commit(); });
          input.addEventListener('input', () => { if (!composing) commit(); });
          input.addEventListener('keydown', (e) => e.stopPropagation());
          wrap.appendChild(input);
          if (def.examples) {
            const ex = el('div', 'examples');
            ex.appendChild(el('span', null, '例：'));
            for (const t of def.examples) {
              const b = el('button', null, t.replace(/\n/g, ' / '));
              b.type = 'button';
              b.addEventListener('click', () => { input.value = t; change(t); });
              ex.appendChild(b);
            }
            wrap.appendChild(ex);
          }
          const info = el('div', 'text-info');
          wrap.appendChild(info);
          this.textInfo = info;
          set = (v) => { if (document.activeElement !== input) input.value = v; };
          break;
        }
        case 'toggle': {
          wrap.classList.add('row');
          const sw = el('label', 'switch');
          const input = el('input');
          input.type = 'checkbox';
          input.addEventListener('change', () => change(input.checked));
          sw.append(input, el('span'));
          head.appendChild(sw);
          label.addEventListener('click', () => { input.checked = !input.checked; change(input.checked); });
          set = (v) => (input.checked = !!v);
          break;
        }
        case 'swatch': {
          const box = el('div', 'swatches');
          const btns = Object.entries(Lab.palettes).map(([k, p]) => {
            const b = el('button', 'swatch');
            b.type = 'button';
            b.title = p.label;
            b.style.background = `linear-gradient(135deg, ${p.colors[0]} 0 33%, ${p.colors[1]} 33% 66%, ${p.colors[2]} 66%)`;
            b.appendChild(el('span', null, p.label));
            b.addEventListener('click', () => change(k));
            box.appendChild(b);
            return [k, b];
          });
          wrap.appendChild(box);
          set = (v) => btns.forEach(([k, b]) => b.classList.toggle('on', k === v));
          break;
        }
        case 'bodies':
          ({ set } = this.makeBodyList(def, wrap, change));
          break;
        case 'obstacles':
          ({ set } = this.makeObstacleList(def, wrap, change));
          break;
        default:
          set = () => {};
      }
      return { el: wrap, def, set };
    }

    // シミュレーション：1つずつの重さ・跳ね返り（文字ごとに上書きできる）
    makeBodyList(def, wrap, change) {
      const list = el('div', 'body-list');
      const foot = el('div', 'body-foot');
      const clear = el('button', 'link', 'すべて基本の値に戻す');
      clear.type = 'button';
      clear.addEventListener('click', () => change({}));
      foot.appendChild(clear);
      wrap.append(list, foot);
      let labelsKey = null, current = {}, rows = [];
      const self = this;
      const slider = (min, max, step, onInput) => {
        const r = el('input');
        r.type = 'range'; r.min = min; r.max = max; r.step = step;
        r.addEventListener('input', () => onInput(parseFloat(r.value)));
        return r;
      };
      function render() {
        list.innerHTML = '';
        rows = self.bodyLabels.map((label, i) => {
          const row = el('div', 'body-row');
          const name = el('span', 'body-name', label);
          const mVal = el('span', 'mini-val'), rVal = el('span', 'mini-val');
          const edit = (field, v) => {
            const next = JSON.parse(JSON.stringify(current));
            next[i] = { ...(next[i] || {}), [field]: v };
            change(next);
          };
          const m = slider(0.1, 10, 0.1, (v) => edit('mass', v));
          const r = slider(0, 1, 0.01, (v) => edit('restitution', v));
          const c1 = el('label', 'mini'), c2 = el('label', 'mini');
          c1.append(el('span', null, '重さ'), m, mVal);
          c2.append(el('span', null, '跳ね返り'), r, rVal);
          row.append(name, c1, c2);
          list.appendChild(row);
          return { m, r, mVal, rVal, row };
        });
      }
      this.renderBodies = () => {
        const key = JSON.stringify(this.bodyLabels);
        if (key !== labelsKey) { labelsKey = key; render(); }
        const p = this.lastParams || {};
        rows.forEach((x, i) => {
          const o = current[i] || {};
          const mass = o.mass ?? p.simMass, rest = o.restitution ?? p.simRestitution;
          if (document.activeElement !== x.m) x.m.value = mass;
          if (document.activeElement !== x.r) x.r.value = rest;
          x.m.style.setProperty('--fill', ((mass - 0.1) / 9.9) * 100 + '%');
          x.r.style.setProperty('--fill', rest * 100 + '%');
          x.mVal.textContent = mass.toFixed(1);
          x.rVal.textContent = rest.toFixed(2);
          x.row.classList.toggle('custom', !!current[i]);
        });
        wrap.classList.toggle('empty', !this.bodyLabels.length);
      };
      this.bodyLabels = [];
      return { set: (v) => { current = v || {}; this.renderBodies(); } };
    }

    setBodyLabels(labels) {
      this.bodyLabels = labels.length > 40 ? labels.slice(0, 40) : labels;
      if (this.renderBodies) this.renderBodies();
    }

    // シミュレーション：障害物の一覧（追加・位置・大きさ・角度・削除）
    makeObstacleList(def, wrap, change) {
      const types = Lab.simEnvironment ? Lab.simEnvironment.OBSTACLES : {};
      const list = el('div', 'obs-list');
      const adds = el('div', 'obs-add');
      let current = [];
      for (const [type, d] of Object.entries(types)) {
        const b = el('button', 'ghost', '＋ ' + d.label);
        b.type = 'button';
        b.addEventListener('click', () => {
          if (current.length >= 8) return;
          const x = ((current.length % 5) - 2) * 2.4;
          change([...current, { type, x, size: 1, angle: type === 'ramp' ? 25 : 0 }]);
        });
        adds.appendChild(b);
      }
      wrap.append(adds, list);
      let structKey = null, rows = [];
      const edit = (i, field, v) => {
        const next = current.map((o) => ({ ...o }));
        next[i][field] = v;
        change(next);
      };
      const render = () => {
        list.innerHTML = '';
        rows = current.map((o, i) => {
          const row = el('div', 'obs-row');
          const head = el('div', 'obs-head');
          head.appendChild(el('span', null, (types[o.type] ? types[o.type].label : o.type) + ' ' + (i + 1)));
          const del = el('button', 'link', '削除');
          del.type = 'button';
          del.addEventListener('click', () => change(current.filter((_, j) => j !== i)));
          head.appendChild(del);
          row.appendChild(head);
          const fields = [['x', '位置（左右）', -7, 7, 0.1], ['size', '大きさ', 0.3, 4, 0.05]];
          if (o.type !== 'pillar') fields.push(['angle', '角度', -45, 45, 1]);
          const inputs = {};
          for (const [f, label, min, max, step] of fields) {
            const lab = el('label', 'mini');
            const r = el('input');
            r.type = 'range'; r.min = min; r.max = max; r.step = step;
            r.addEventListener('input', () => edit(i, f, parseFloat(r.value)));
            lab.append(el('span', null, label), r);
            row.appendChild(lab);
            inputs[f] = { r, min, max };
          }
          list.appendChild(row);
          return inputs;
        });
      };
      return {
        set: (v) => {
          current = Array.isArray(v) ? v : [];
          const key = current.map((o) => o.type).join(',');
          if (key !== structKey) { structKey = key; render(); }
          rows.forEach((inputs, i) => {
            for (const f in inputs) {
              const { r, min, max } = inputs[f];
              if (document.activeElement !== r) r.value = current[i][f];
              r.style.setProperty('--fill', ((current[i][f] - min) / (max - min)) * 100 + '%');
            }
          });
          adds.querySelectorAll('button').forEach((b) => (b.disabled = current.length >= 8));
        },
      };
    }

    // 文字の集合先の情報（文字数・行数・推奨の破片数）
    setTextInfo(info, count) {
      const box = this.textInfo;
      if (!box) return;
      box.innerHTML = '';
      if (!info) return;
      box.appendChild(el('span', null, `${info.chars}文字・${info.lines}行`));
      const diff = Math.abs(info.recommended - count) / info.recommended;
      if (diff > 0.25) {
        const b = el('button', 'link', `破片数を推奨の約${info.recommended}個にする`);
        b.type = 'button';
        b.title = '文字の量に対して破片が' + (count < info.recommended ? '少なく、形が読みにくくなっています' : '多めです');
        b.addEventListener('click', () => this.h.change('count', info.recommended));
        box.appendChild(b);
      } else {
        box.appendChild(el('span', 'ok', '破片数ちょうど良い'));
      }
    }

    refresh(state) {
      const eff = Lab.effects[state.effect];
      const sim = eff.kind === 'sim';
      this.lastParams = state.params;
      const visibleCount = {};
      for (const key in this.controls) {
        const c = this.controls[key], d = c.def;
        let show = (!d.effects || d.effects.includes(state.effect)) && (!d.showIf || d.showIf(state.params, state.effect));
        // シミュレーションでは、シミュレーション用と共通の項目（文字・見た目）だけを出す
        if (sim && !d.sim && !(d.effects && d.effects.includes('sim'))) show = false;
        c.el.hidden = !show;
        c.set(state.params[key]);
        if (show) visibleCount[d.group] = (visibleCount[d.group] || 0) + 1;
      }
      for (const g in this.sections) this.sections[g].sec.hidden = !visibleCount[g];
      this.sections.effect.title.textContent = eff.label + 'の設定';
      this.sections.target.title.textContent = sim ? '動かすもの' : Lab.groupLabels.target;
      this.simReseed.hidden = !sim;
    }

    // ---- 左パネル：プリセット一覧 ----
    static buildPresetList(root, onPick) {
      root.innerHTML = '';
      const items = {};
      for (const effId of Lab.effectOrder) {
        const eff = Lab.effects[effId];
        const group = el('div', 'preset-group');
        const h = el('div', 'preset-head');
        h.append(el('span', 'dot ' + effId), el('span', null, eff.label));
        group.appendChild(h);
        for (const p of Lab.presets.filter((x) => x.effect === effId)) {
          const b = el('button', 'preset');
          b.type = 'button';
          b.append(el('span', 'check', '✓'), el('span', 'pname', p.name), el('span', 'pdesc', p.desc));
          b.addEventListener('click', () => onPick(p.id));
          group.appendChild(b);
          items[p.id] = b;
        }
        root.appendChild(group);
      }
      return (activeId) => {
        for (const id in items) items[id].classList.toggle('on', id === activeId);
      };
    }
  };
})();
