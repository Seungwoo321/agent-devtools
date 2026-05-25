var e = Object.defineProperty,
  t = (t, n) => {
    let r = {};
    for (var i in t) e(r, i, { get: t[i], enumerable: !0 });
    return (n || e(r, Symbol.toStringTag, { value: `Module` }), r);
  },
  n = Array.isArray,
  r = Array.prototype.indexOf,
  i = Array.prototype.includes,
  a = Array.from,
  o = Object.defineProperty,
  s = Object.getOwnPropertyDescriptor,
  c = Object.prototype,
  l = Array.prototype,
  u = Object.getPrototypeOf,
  d = Object.isExtensible,
  f = () => {};
function p(e) {
  for (var t = 0; t < e.length; t++) e[t]();
}
function m() {
  var e, t;
  return {
    promise: new Promise((n, r) => {
      ((e = n), (t = r));
    }),
    resolve: e,
    reject: t,
  };
}
var h = 1024,
  g = 2048,
  _ = 4096,
  ee = 8192,
  te = 16384,
  ne = 32768,
  re = 1 << 25,
  ie = 65536,
  ae = 1 << 19,
  oe = 1 << 20,
  se = 65536,
  ce = 1 << 21,
  le = 1 << 22,
  ue = 1 << 23,
  de = Symbol(`$state`),
  fe = Symbol(`legacy props`),
  pe = Symbol(`attributes`),
  me = Symbol(`class`),
  he = Symbol(`style`),
  ge = Symbol(`text`),
  _e = new (class extends Error {
    name = `StaleReactionError`;
    message = 'The reaction that called `getAbortSignal()` was re-run or destroyed';
  })();
globalThis.document?.contentType;
function ve(e) {
  throw Error(`https://svelte.dev/e/experimental_async_required`);
}
function ye(e) {
  throw Error(`https://svelte.dev/e/lifecycle_outside_component`);
}
function be() {
  throw Error(`https://svelte.dev/e/missing_context`);
}
function xe() {
  throw Error(`https://svelte.dev/e/async_derived_orphan`);
}
function Se(e) {
  throw Error(`https://svelte.dev/e/effect_in_teardown`);
}
function Ce() {
  throw Error(`https://svelte.dev/e/effect_in_unowned_derived`);
}
function we(e) {
  throw Error(`https://svelte.dev/e/effect_orphan`);
}
function Te() {
  throw Error(`https://svelte.dev/e/effect_update_depth_exceeded`);
}
function Ee() {
  throw Error(`https://svelte.dev/e/fork_discarded`);
}
function De() {
  throw Error(`https://svelte.dev/e/fork_timing`);
}
function Oe() {
  throw Error(`https://svelte.dev/e/get_abort_signal_outside_reaction`);
}
function ke() {
  throw Error(`https://svelte.dev/e/hydration_failed`);
}
function Ae(e) {
  throw Error(`https://svelte.dev/e/lifecycle_legacy_only`);
}
function je(e) {
  throw Error(`https://svelte.dev/e/props_invalid_value`);
}
function Me() {
  throw Error(`https://svelte.dev/e/set_context_after_init`);
}
function Ne() {
  throw Error(`https://svelte.dev/e/state_descriptors_fixed`);
}
function Pe() {
  throw Error(`https://svelte.dev/e/state_prototype_fixed`);
}
function Fe() {
  throw Error(`https://svelte.dev/e/state_unsafe_mutation`);
}
function Ie() {
  throw Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`);
}
var Le = {},
  v = Symbol(`uninitialized`);
function Re() {
  console.warn(`https://svelte.dev/e/derived_inert`);
}
function ze(e) {
  console.warn(`https://svelte.dev/e/hydratable_missing_but_expected`);
}
function Be(e) {
  console.warn(`https://svelte.dev/e/hydration_mismatch`);
}
function Ve() {
  console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`);
}
var y = !1;
function b(e) {
  y = e;
}
var x;
function S(e) {
  if (e === null) throw (Be(), Le);
  return (x = e);
}
function He() {
  return S(I(x));
}
function Ue(e) {
  if (y) {
    if (I(x) !== null) throw (Be(), Le);
    x = e;
  }
}
function We(e = 1) {
  if (y) {
    for (var t = e, n = x; t--; ) n = I(n);
    x = n;
  }
}
function Ge(e = !0) {
  for (var t = 0, n = x; ; ) {
    if (n.nodeType === 8) {
      var r = n.data;
      if (r === `]`) {
        if (t === 0) return n;
        --t;
      } else (r === `[` || r === `[!` || (r[0] === `[` && !isNaN(Number(r.slice(1))))) && (t += 1);
    }
    var i = I(n);
    (e && n.remove(), (n = i));
  }
}
function Ke(e) {
  if (!e || e.nodeType !== 8) throw (Be(), Le);
  return e.data;
}
function qe(e) {
  return e === this.v;
}
function Je(e, t) {
  return e == e ? e !== t || (typeof e == `object` && !!e) || typeof e == `function` : t == t;
}
function Ye(e) {
  return !Je(e, this.v);
}
var C = !1,
  Xe = !1;
function Ze() {
  Xe = !0;
}
var w = null;
function Qe(e) {
  w = e;
}
function $e() {
  let e = {};
  return [() => (nt(e) || be(), et(e)), (t) => tt(e, t)];
}
function et(e) {
  return st(`getContext`).get(e);
}
function tt(e, t) {
  let n = st(`setContext`);
  if (C) {
    var r = W.f;
    (!V && r & 32 && !w.i) || Me();
  }
  return (n.set(e, t), t);
}
function nt(e) {
  return st(`hasContext`).has(e);
}
function rt() {
  return st(`getAllContexts`);
}
function it(e, t = !1, n) {
  w = {
    p: w,
    i: !1,
    c: null,
    e: null,
    s: e,
    x: null,
    r: W,
    l: Xe && !t ? { s: null, u: null, $: [] } : null,
  };
}
function at(e) {
  var t = w,
    n = t.e;
  if (n !== null) {
    t.e = null;
    for (var r of n) In(r);
  }
  return (e !== void 0 && (t.x = e), (t.i = !0), (w = t.p), e ?? {});
}
function ot() {
  return !Xe || (w !== null && w.l === null);
}
function st(e) {
  return (w === null && ye(e), (w.c ??= new Map(ct(w) || void 0)));
}
function ct(e) {
  let t = e.p;
  for (; t !== null; ) {
    let e = t.c;
    if (e !== null) return e;
    t = t.p;
  }
  return null;
}
var T = [];
function lt() {
  var e = T;
  ((T = []), p(e));
}
function ut(e) {
  if (T.length === 0 && !Et) {
    var t = T;
    queueMicrotask(() => {
      t === T && lt();
    });
  }
  T.push(e);
}
function dt() {
  for (; T.length > 0; ) lt();
}
function ft(e) {
  var t = W;
  if (t === null) return ((V.f |= ue), e);
  if (!(t.f & 32768) && !(t.f & 4)) throw e;
  E(e, t);
}
function E(e, t) {
  for (; t !== null; ) {
    if (t.f & 128) {
      if (!(t.f & 32768)) throw e;
      try {
        t.b.error(e);
        return;
      } catch (t) {
        e = t;
      }
    }
    t = t.parent;
  }
  throw e;
}
var pt = ~(g | _ | h);
function D(e, t) {
  e.f = (e.f & pt) | t;
}
function mt(e) {
  e.f & 512 || e.deps === null ? D(e, h) : D(e, _);
}
function ht(e) {
  if (e !== null) for (let t of e) !(t.f & 2) || !(t.f & 65536) || ((t.f ^= se), ht(t.deps));
}
function gt(e, t, n) {
  (e.f & 2048 ? t.add(e) : e.f & 4096 && n.add(e), ht(e.deps), D(e, h));
}
var _t = [];
function vt(e, t = f) {
  let n = null,
    r = new Set();
  function i(t) {
    if (Je(e, t) && ((e = t), n)) {
      let t = !_t.length;
      for (let t of r) (t[1](), _t.push(t, e));
      if (t) {
        for (let e = 0; e < _t.length; e += 2) _t[e][0](_t[e + 1]);
        _t.length = 0;
      }
    }
  }
  function a(t) {
    i(t(e));
  }
  function o(o, s = f) {
    let c = [o, s];
    return (
      r.add(c),
      r.size === 1 && (n = t(i, a) || f),
      o(e),
      () => {
        (r.delete(c), r.size === 0 && n && (n(), (n = null)));
      }
    );
  }
  return { set: i, update: a, subscribe: o };
}
var yt = !1,
  bt = !1;
function xt(e) {
  var t = bt;
  try {
    return ((bt = !1), [e(), bt]);
  } finally {
    bt = t;
  }
}
var St = null,
  Ct = null,
  O = null,
  wt = null,
  k = null,
  Tt = null,
  Et = !1,
  Dt = !1,
  Ot = null,
  kt = null,
  At = 0,
  jt = 1,
  Mt = class e {
    id = jt++;
    #e = !1;
    linked = !0;
    #t = null;
    #n = null;
    async_deriveds = new Map();
    current = new Map();
    previous = new Map();
    unblocked = new Set();
    #r = new Set();
    #i = new Set();
    #a = new Set();
    #o = 0;
    #s = new Map();
    #c = null;
    #l = [];
    #u = [];
    #d = new Set();
    #f = new Set();
    #p = new Map();
    #m = new Set();
    is_fork = !1;
    #h = !1;
    #g() {
      if (this.is_fork) return !0;
      for (let n of this.#s.keys()) {
        for (var e = n, t = !1; e.parent !== null; ) {
          if (this.#p.has(e)) {
            t = !0;
            break;
          }
          e = e.parent;
        }
        if (!t) return !0;
      }
      return !1;
    }
    skip_effect(e) {
      (this.#p.has(e) || this.#p.set(e, { d: [], m: [] }), this.#m.delete(e));
    }
    unskip_effect(e, t = (e) => this.schedule(e)) {
      var n = this.#p.get(e);
      if (n) {
        this.#p.delete(e);
        for (var r of n.d) (D(r, g), t(r));
        for (r of n.m) (D(r, _), t(r));
      }
      this.#m.add(e);
    }
    #_() {
      if (((this.#e = !0), At++ > 1e3 && (this.#w(), Pt()), !this.#g())) {
        for (let e of this.#d) (this.#f.delete(e), D(e, g), this.schedule(e));
        for (let e of this.#f) (D(e, _), this.schedule(e));
      }
      let t = this.#l;
      ((this.#l = []), this.apply());
      var n = (Ot = []),
        r = [],
        i = (kt = []);
      for (let e of t)
        try {
          this.#v(e, n, r);
        } catch (t) {
          throw (Vt(e), t);
        }
      if (((O = null), i.length > 0)) {
        var a = e.ensure();
        for (let e of i) a.schedule(e);
      }
      if (((Ot = null), (kt = null), this.#g())) {
        (this.#x(r), this.#x(n));
        for (let [e, t] of this.#p) Bt(e, t);
        i.length > 0 && O.#_();
        return;
      }
      let o = this.#y();
      if (o) {
        o.#b(this);
        return;
      }
      (this.#d.clear(), this.#f.clear());
      for (let e of this.#r) e(this);
      (this.#r.clear(), (wt = this), Ft(r), Ft(n), (wt = null), this.#c?.resolve());
      var s = O;
      if (
        (this.linked && this.#o === 0 && this.#w(),
        C && !this.linked && (this.#S(), (O = s)),
        this.#l.length > 0)
      ) {
        s === null && ((s = this), this.#C());
        let e = s;
        e.#l.push(...this.#l.filter((t) => !e.#l.includes(t)));
      }
      s !== null && s.#_();
    }
    #v(e, t, n) {
      e.f ^= h;
      for (var r = e.first; r !== null; ) {
        var i = r.f,
          a = (i & 96) != 0;
        if (!((a && i & 1024) || i & 8192 || this.#p.has(r)) && r.fn !== null) {
          a
            ? (r.f ^= h)
            : i & 4
              ? t.push(r)
              : C && i & 16777224
                ? n.push(r)
                : cr(r) && (i & 16 && this.#f.add(r), pr(r));
          var o = r.first;
          if (o !== null) {
            r = o;
            continue;
          }
        }
        for (; r !== null; ) {
          var s = r.next;
          if (s !== null) {
            r = s;
            break;
          }
          r = r.parent;
        }
      }
    }
    #y() {
      for (var e = this.#t; e !== null; ) {
        if (!e.is_fork) {
          for (let [t, [, n]] of this.current) if (e.current.has(t) && !n) return e;
        }
        e = e.#t;
      }
      return null;
    }
    #b(e) {
      for (let [t, n] of e.current)
        (!this.previous.has(t) && e.previous.has(t) && this.previous.set(t, e.previous.get(t)),
          this.current.set(t, n));
      for (let [t, n] of e.async_deriveds) {
        let e = this.async_deriveds.get(t);
        e && n.promise.then(e.resolve);
      }
      let t = (e) => {
        var n = e.reactions;
        if (n !== null)
          for (let e of n) {
            var r = e.f;
            if (r & 2) t(e);
            else {
              var i = e;
              r & 4194320 &&
                !this.async_deriveds.has(i) &&
                (this.#f.delete(i), D(i, g), this.schedule(i));
            }
          }
      };
      for (let e of this.current.keys()) t(e);
      (this.oncommit(() => e.discard()), e.#w(), (O = this), this.#_());
    }
    #x(e) {
      for (var t = 0; t < e.length; t += 1) gt(e[t], this.#d, this.#f);
    }
    capture(e, t, n = !1) {
      (e.v !== v && !this.previous.has(e) && this.previous.set(e, e.v),
        e.f & 8388608 || (this.current.set(e, [t, n]), k?.set(e, t)),
        this.is_fork || (e.v = t));
    }
    activate() {
      O = this;
    }
    deactivate() {
      ((O = null), (k = null));
    }
    flush() {
      try {
        ((Dt = !0), (O = this), this.#_());
      } finally {
        ((At = 0),
          (Tt = null),
          (Ot = null),
          (kt = null),
          (Dt = !1),
          (O = null),
          (k = null),
          j.clear());
      }
    }
    discard() {
      for (let e of this.#i) e(this);
      (this.#i.clear(), this.#a.clear(), this.#w());
    }
    register_created_effect(e) {
      this.#u.push(e);
    }
    #S() {
      this.#w();
      for (let l = St; l !== null; l = l.#n) {
        var e = l.id < this.id,
          t = [];
        for (let [r, [i, a]] of this.current) {
          if (l.current.has(r)) {
            var n = l.current.get(r)[0];
            if (e && i !== n) l.current.set(r, [i, a]);
            else continue;
          }
          t.push(r);
        }
        if (e)
          for (let [e, t] of this.async_deriveds) {
            let n = l.async_deriveds.get(e);
            n && t.promise.then(n.resolve);
          }
        if (l.#e) {
          var r = [...l.current.keys()].filter((e) => !this.current.has(e));
          if (r.length === 0) e && l.discard();
          else if (t.length > 0) {
            if (e)
              for (let e of this.#m)
                l.unskip_effect(e, (e) => {
                  e.f & 4194320 ? l.schedule(e) : l.#x([e]);
                });
            l.activate();
            var i = new Set(),
              a = new Map();
            for (var o of t) It(o, r, i, a);
            a = new Map();
            var s = [...l.current.keys()].filter((e) =>
              this.current.has(e) ? this.current.get(e)[0] !== e.v : !0,
            );
            if (s.length > 0)
              for (let e of this.#u)
                !(e.f & 155648) &&
                  Rt(e, s, a) &&
                  (e.f & 4194320 ? (D(e, g), l.schedule(e)) : l.#d.add(e));
            if (l.#l.length > 0 && !l.#h) {
              l.apply();
              for (var c of l.#l) l.#v(c, [], []);
              l.#l = [];
            }
            l.deactivate();
          }
        }
      }
    }
    increment(e, t) {
      if (((this.#o += 1), e)) {
        let e = this.#s.get(t) ?? 0;
        this.#s.set(t, e + 1);
      }
    }
    decrement(e, t) {
      if ((--this.#o, e)) {
        let e = this.#s.get(t) ?? 0;
        e === 1 ? this.#s.delete(t) : this.#s.set(t, e - 1);
      }
      this.#h ||
        ((this.#h = !0),
        ut(() => {
          ((this.#h = !1), this.linked && this.flush());
        }));
    }
    transfer_effects(e, t) {
      for (let t of e) this.#d.add(t);
      for (let e of t) this.#f.add(e);
      (e.clear(), t.clear());
    }
    oncommit(e) {
      this.#r.add(e);
    }
    ondiscard(e) {
      this.#i.add(e);
    }
    on_fork_commit(e) {
      this.#a.add(e);
    }
    run_fork_commit_callbacks() {
      for (let e of this.#a) e(this);
      this.#a.clear();
    }
    settled() {
      return (this.#c ??= m()).promise;
    }
    static ensure() {
      if (O === null) {
        let t = (O = new e());
        (t.#C(),
          !Dt &&
            !Et &&
            ut(() => {
              t.#e || t.flush();
            }));
      }
      return O;
    }
    apply() {
      if (!C || (!this.is_fork && this.#t === null && this.#n === null)) {
        k = null;
        return;
      }
      k = new Map();
      for (let [e, [t]] of this.current) k.set(e, t);
      for (let t = St; t !== null; t = t.#n)
        if (!(t === this || t.is_fork)) {
          var e = !1;
          if (t.id < this.id) {
            for (let [n, [, r]] of t.current)
              if (!r && this.current.has(n)) {
                e = !0;
                break;
              }
          }
          if (!e) for (let [e, n] of t.previous) k.has(e) || k.set(e, n);
        }
    }
    schedule(e) {
      if (((Tt = e), e.b?.is_pending && e.f & 16777228 && !(e.f & 32768))) {
        e.b.defer_effect(e);
        return;
      }
      for (var t = e; t.parent !== null; ) {
        t = t.parent;
        var n = t.f;
        if (Ot !== null && t === W && (C || ((V === null || !(V.f & 2)) && !yt))) return;
        if (n & 96) {
          if (!(n & 1024)) return;
          t.f ^= h;
        }
      }
      this.#l.push(t);
    }
    #C() {
      (Ct === null ? (St = Ct = this) : ((Ct.#n = this), (this.#t = Ct)), (Ct = this));
    }
    #w() {
      var e = this.#t,
        t = this.#n;
      (e === null ? (St = t) : (e.#n = t), t === null ? (Ct = e) : (t.#t = e), (this.linked = !1));
    }
  };
function Nt(e) {
  var t = Et;
  Et = !0;
  try {
    var n;
    for (e && (O !== null && !O.is_fork && O.flush(), (n = e())); ; ) {
      if ((dt(), O === null)) return n;
      O.flush();
    }
  } finally {
    Et = t;
  }
}
function Pt() {
  try {
    Te();
  } catch (e) {
    E(e, Tt);
  }
}
var A = null;
function Ft(e) {
  var t = e.length;
  if (t !== 0) {
    for (var n = 0; n < t; ) {
      var r = e[n++];
      if (
        !(r.f & 24576) &&
        cr(r) &&
        ((A = new Set()),
        pr(r),
        r.deps === null &&
          r.first === null &&
          r.nodes === null &&
          r.teardown === null &&
          r.ac === null &&
          Jn(r),
        A?.size > 0)
      ) {
        j.clear();
        for (let e of A) {
          if (e.f & 24576) continue;
          let t = [e],
            n = e.parent;
          for (; n !== null; ) (A.has(n) && (A.delete(n), t.push(n)), (n = n.parent));
          for (let e = t.length - 1; e >= 0; e--) {
            let n = t[e];
            n.f & 24576 || pr(n);
          }
        }
        A.clear();
      }
    }
    A = null;
  }
}
function It(e, t, n, r) {
  if (!n.has(e) && (n.add(e), e.reactions !== null))
    for (let i of e.reactions) {
      let e = i.f;
      e & 2 ? It(i, t, n, r) : e & 4194320 && !(e & 2048) && Rt(i, t, r) && (D(i, g), zt(i));
    }
}
function Lt(e, t) {
  if (e.reactions !== null)
    for (let n of e.reactions) {
      let e = n.f;
      e & 2 ? Lt(n, t) : e & 131072 && (D(n, g), t.add(n));
    }
}
function Rt(e, t, n) {
  let r = n.get(e);
  if (r !== void 0) return r;
  if (e.deps !== null)
    for (let r of e.deps) {
      if (i.call(t, r)) return !0;
      if (r.f & 2 && Rt(r, t, n)) return (n.set(r, !0), !0);
    }
  return (n.set(e, !1), !1);
}
function zt(e) {
  O.schedule(e);
}
function Bt(e, t) {
  if (!(e.f & 32 && e.f & 1024)) {
    (e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), D(e, h));
    for (var n = e.first; n !== null; ) (Bt(n, t), (n = n.next));
  }
}
function Vt(e) {
  D(e, h);
  for (var t = e.first; t !== null; ) (Vt(t), (t = t.next));
}
function Ht(e) {
  (C || ve(`fork`), O !== null && De());
  var t = Mt.ensure();
  ((t.is_fork = !0), (k = new Map()));
  var n = !1,
    r = t.settled();
  return (
    Nt(e),
    {
      commit: async () => {
        if (n) {
          await r;
          return;
        }
        (t.linked || Ee(), (n = !0), (t.is_fork = !1));
        for (var [e, [i]] of t.current) ((e.v = i), (e.wv = sr()));
        (t.activate(),
          t.run_fork_commit_callbacks(),
          t.deactivate(),
          Nt(() => {
            var e = new Set();
            for (var n of t.current.keys()) Lt(n, e);
            (ln(e), mn());
          }),
          t.flush(),
          await r);
      },
      discard: () => {
        for (var e of t.current.keys()) e.wv = sr();
        !n && t.linked && t.discard();
      },
    }
  );
}
function Ut(e) {
  let t = 0,
    n = dn(0),
    r;
  return () => {
    Nn() &&
      (Q(n),
      Vn(
        () => (
          t === 0 && (r = vr(() => e(() => hn(n)))),
          (t += 1),
          () => {
            ut(() => {
              (--t, t === 0 && (r?.(), (r = void 0), hn(n)));
            });
          }
        ),
      ));
  };
}
var Wt = ie | ae;
function Gt(e, t, n, r) {
  new Kt(e, t, n, r);
}
var Kt = class {
  parent;
  is_pending = !1;
  transform_error;
  #e;
  #t = y ? x : null;
  #n;
  #r;
  #i;
  #a = null;
  #o = null;
  #s = null;
  #c = null;
  #l = 0;
  #u = 0;
  #d = !1;
  #f = new Set();
  #p = new Set();
  #m = null;
  #h = Ut(
    () => (
      (this.#m = dn(this.#l)),
      () => {
        this.#m = null;
      }
    ),
  );
  constructor(e, t, n, r) {
    ((this.#e = e),
      (this.#n = t),
      (this.#r = (e) => {
        var t = W;
        ((t.b = this), (t.f |= 128), n(e));
      }),
      (this.parent = W.b),
      (this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e)),
      (this.#i = Un(() => {
        if (y) {
          let e = this.#t;
          He();
          let t = e.data === `[!`;
          if (e.data.startsWith(`[?`)) {
            let t = JSON.parse(e.data.slice(2));
            this.#_(t);
          } else t ? this.#v() : this.#g();
        } else this.#y();
      }, Wt)),
      y && (this.#e = x));
  }
  #g() {
    try {
      this.#a = R(() => this.#r(this.#e));
    } catch (e) {
      this.error(e);
    }
  }
  #_(e) {
    let t = this.#n.failed;
    t &&
      (this.#s = R(() => {
        t(
          this.#e,
          () => e,
          () => () => {},
        );
      }));
  }
  #v() {
    let e = this.#n.pending;
    e &&
      ((this.is_pending = !0),
      (this.#o = R(() => e(this.#e))),
      ut(() => {
        var e = (this.#c = document.createDocumentFragment()),
          t = P();
        (e.append(t),
          (this.#a = this.#x(() => R(() => this.#r(t)))),
          this.#u === 0 &&
            (this.#e.before(e),
            (this.#c = null),
            Yn(this.#o, () => {
              this.#o = null;
            }),
            this.#b(O)));
      }));
  }
  #y() {
    try {
      if (
        ((this.is_pending = this.has_pending_snippet()),
        (this.#u = 0),
        (this.#l = 0),
        (this.#a = R(() => {
          this.#r(this.#e);
        })),
        this.#u > 0)
      ) {
        var e = (this.#c = document.createDocumentFragment());
        $n(this.#a, e);
        let t = this.#n.pending;
        this.#o = R(() => t(this.#e));
      } else this.#b(O);
    } catch (e) {
      this.error(e);
    }
  }
  #b(e) {
    ((this.is_pending = !1), e.transfer_effects(this.#f, this.#p));
  }
  defer_effect(e) {
    gt(e, this.#f, this.#p);
  }
  is_rendered() {
    return !this.is_pending && (!this.parent || this.parent.is_rendered());
  }
  has_pending_snippet() {
    return !!this.#n.pending;
  }
  #x(e) {
    var t = W,
      n = V,
      r = w;
    (G(this.#i), U(this.#i), Qe(this.#i.ctx));
    try {
      return (Mt.ensure(), e());
    } catch (e) {
      return (ft(e), null);
    } finally {
      (G(t), U(n), Qe(r));
    }
  }
  #S(e, t) {
    if (!this.has_pending_snippet()) {
      this.parent && this.parent.#S(e, t);
      return;
    }
    ((this.#u += e),
      this.#u === 0 &&
        (this.#b(t),
        this.#o &&
          Yn(this.#o, () => {
            this.#o = null;
          }),
        (this.#c &&= (this.#e.before(this.#c), null))));
  }
  update_pending_count(e, t) {
    (this.#S(e, t),
      (this.#l += e),
      !(!this.#m || this.#d) &&
        ((this.#d = !0),
        ut(() => {
          ((this.#d = !1), this.#m && pn(this.#m, this.#l));
        })));
  }
  get_effect_pending() {
    return (this.#h(), Q(this.#m));
  }
  error(e) {
    if (!this.#n.onerror && !this.#n.failed) throw e;
    O?.is_fork
      ? (this.#a && O.skip_effect(this.#a),
        this.#o && O.skip_effect(this.#o),
        this.#s && O.skip_effect(this.#s),
        O.on_fork_commit(() => {
          this.#C(e);
        }))
      : this.#C(e);
  }
  #C(e) {
    ((this.#a &&= (z(this.#a), null)),
      (this.#o &&= (z(this.#o), null)),
      (this.#s &&= (z(this.#s), null)),
      y && (S(this.#t), We(), S(Ge())));
    var t = this.#n.onerror;
    let n = this.#n.failed;
    var r = !1,
      i = !1;
    let a = () => {
        if (r) {
          Ve();
          return;
        }
        ((r = !0),
          i && Ie(),
          this.#s !== null &&
            Yn(this.#s, () => {
              this.#s = null;
            }),
          this.#x(() => {
            this.#y();
          }));
      },
      o = (e) => {
        try {
          ((i = !0), t?.(e, a), (i = !1));
        } catch (e) {
          E(e, this.#i && this.#i.parent);
        }
        n &&
          (this.#s = this.#x(() => {
            try {
              return R(() => {
                var t = W;
                ((t.b = this),
                  (t.f |= 128),
                  n(
                    this.#e,
                    () => e,
                    () => a,
                  ));
              });
            } catch (e) {
              return (E(e, this.#i.parent), null);
            }
          }));
      };
    ut(() => {
      var t;
      try {
        t = this.transform_error(e);
      } catch (e) {
        E(e, this.#i && this.#i.parent);
        return;
      }
      typeof t == `object` && t && typeof t.then == `function`
        ? t.then(o, (e) => E(e, this.#i && this.#i.parent))
        : o(t);
    });
  }
};
function qt(e, t, n, r) {
  let i = ot() ? Zt : tn;
  var a = e.filter((e) => !e.settled);
  if (n.length === 0 && a.length === 0) {
    r(t.map(i));
    return;
  }
  var o = W,
    s = Jt(),
    c = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
  function l(e) {
    if (!(o.f & 16384)) {
      s();
      try {
        r(e);
      } catch (e) {
        E(e, o);
      }
      Yt();
    }
  }
  var u = Xt();
  if (n.length === 0) {
    c.then(() => l(t.map(i))).finally(u);
    return;
  }
  function d() {
    Promise.all(n.map((e) => $t(e)))
      .then((e) => l([...t.map(i), ...e]))
      .catch((e) => E(e, o))
      .finally(u);
  }
  c
    ? c.then(() => {
        (s(), d(), Yt());
      })
    : d();
}
function Jt() {
  var e = W,
    t = V,
    n = w,
    r = O;
  return function (i = !0) {
    (G(e), U(t), Qe(n), i && !(e.f & 16384) && (r?.activate(), r?.apply()));
  };
}
function Yt(e = !0) {
  (G(null), U(null), Qe(null), e && O?.deactivate());
}
function Xt() {
  var e = W,
    t = e.b,
    n = O,
    r = t.is_rendered();
  return (
    t.update_pending_count(1, n),
    n.increment(r, e),
    () => {
      (t.update_pending_count(-1, n), n.decrement(r, e));
    }
  );
}
function Zt(e) {
  var t = 2 | g;
  return (
    W !== null && (W.f |= ae),
    {
      ctx: w,
      deps: null,
      effects: null,
      equals: qe,
      f: t,
      fn: e,
      reactions: null,
      rv: 0,
      v,
      wv: 0,
      parent: W,
      ac: null,
    }
  );
}
var Qt = Symbol(`obsolete`);
function $t(e, t, n) {
  let r = W;
  r === null && xe();
  var i = void 0,
    a = dn(v),
    o = !V,
    s = new Set();
  return (
    Bn(() => {
      var t = W,
        n = m();
      i = n.promise;
      try {
        Promise.resolve(e())
          .then(n.resolve, (e) => {
            e !== _e && n.reject(e);
          })
          .finally(Yt);
      } catch (e) {
        (n.reject(e), Yt());
      }
      var c = O;
      if (o) {
        if (t.f & 32768) var l = Xt();
        if (r.b.is_rendered()) c.async_deriveds.get(t)?.reject(Qt);
        else for (let e of s.values()) e.reject(Qt);
        (s.add(n), c.async_deriveds.set(t, n));
      }
      let u = (e, t = void 0) => {
        (l?.(),
          s.delete(n),
          t !== Qt &&
            (c.activate(),
            t ? ((a.f |= ue), pn(a, t)) : (a.f & 8388608 && (a.f ^= ue), pn(a, e)),
            c.deactivate()));
      };
      n.promise.then(u, (e) => u(null, e || `unknown`));
    }),
    Pn(() => {
      for (let e of s) e.reject(Qt);
    }),
    new Promise((e) => {
      function t(n) {
        function r() {
          n === i ? e(a) : t(i);
        }
        n.then(r, r);
      }
      t(i);
    })
  );
}
function en(e) {
  let t = Zt(e);
  return (C || rr(t), t);
}
function tn(e) {
  let t = Zt(e);
  return ((t.equals = Ye), t);
}
function nn(e) {
  var t = e.effects;
  if (t !== null) {
    e.effects = null;
    for (var n = 0; n < t.length; n += 1) z(t[n]);
  }
}
function rn(e) {
  var t,
    n = W,
    r = e.parent;
  if (!B && r !== null && e.v !== v && r.f & 24576) return (Re(), e.v);
  G(r);
  try {
    ((e.f &= ~se), nn(e), (t = ur(e)));
  } finally {
    G(n);
  }
  return t;
}
function an(e) {
  var t = rn(e);
  if (
    !e.equals(t) &&
    ((e.wv = sr()),
    (!O?.is_fork || e.deps === null) &&
      (O === null ? (e.v = t) : (O.capture(e, t, !0), wt?.capture(e, t, !0)), e.deps === null))
  ) {
    D(e, h);
    return;
  }
  B || (k === null ? mt(e) : (Nn() || O?.is_fork) && k.set(e, t));
}
function on(e) {
  if (e.effects !== null)
    for (let t of e.effects)
      (t.teardown || t.ac) &&
        (t.teardown?.(),
        t.ac?.abort(_e),
        t.fn !== null && (t.teardown = f),
        (t.ac = null),
        fr(t, 0),
        Gn(t));
}
function sn(e) {
  if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && pr(t);
}
var cn = new Set(),
  j = new Map();
function ln(e) {
  cn = e;
}
var un = !1;
function dn(e, t) {
  return { f: 0, v: e, reactions: null, equals: qe, rv: 0, wv: 0 };
}
function M(e, t) {
  let n = dn(e, t);
  return (rr(n), n);
}
function fn(e, t = !1, n = !0) {
  let r = dn(e);
  return (t || (r.equals = Ye), Xe && n && w !== null && w.l !== null && (w.l.s ??= []).push(r), r);
}
function N(e, t, n = !1) {
  return (
    V !== null &&
      (!H || V.f & 131072) &&
      ot() &&
      V.f & 4325394 &&
      (K === null || !i.call(K, e)) &&
      Fe(),
    pn(e, n ? _n(t) : t, kt)
  );
}
function pn(e, t, n = null) {
  if (!e.equals(t)) {
    j.set(e, B ? t : e.v);
    var r = Mt.ensure();
    if ((r.capture(e, t), e.f & 2)) {
      let t = e;
      (e.f & 2048 && rn(t), k === null && mt(t));
    }
    ((e.wv = sr()),
      gn(e, g, n),
      ot() && W !== null && W.f & 1024 && !(W.f & 96) && (Y === null ? ir([e]) : Y.push(e)),
      !r.is_fork && cn.size > 0 && !un && mn());
  }
  return t;
}
function mn() {
  un = !1;
  for (let e of cn) {
    e.f & 1024 && D(e, _);
    let t;
    try {
      t = cr(e);
    } catch {
      t = !0;
    }
    t && pr(e);
  }
  cn.clear();
}
function hn(e) {
  N(e, e.v + 1);
}
function gn(e, t, n) {
  var r = e.reactions;
  if (r !== null)
    for (var i = ot(), a = r.length, o = 0; o < a; o++) {
      var s = r[o],
        c = s.f;
      if (!(!i && s === W)) {
        var l = (c & g) === 0;
        if ((l && D(s, t), c & 131072)) cn.add(s);
        else if (c & 2) {
          var u = s;
          (k?.delete(u),
            c & 65536 || (c & 512 && (W === null || !(W.f & 2097152)) && (s.f |= se), gn(u, _, n)));
        } else if (l) {
          var d = s;
          (c & 16 && A !== null && A.add(d), n === null ? zt(d) : n.push(d));
        }
      }
    }
}
function _n(e) {
  if (typeof e != `object` || !e || de in e) return e;
  let t = u(e);
  if (t !== c && t !== l) return e;
  var r = new Map(),
    i = n(e),
    a = M(0),
    o = null,
    d = Z,
    f = (e) => {
      if (Z === d) return e();
      var t = V,
        n = Z;
      (U(null), or(d));
      var r = e();
      return (U(t), or(n), r);
    };
  return (
    i && r.set(`length`, M(e.length, o)),
    new Proxy(e, {
      defineProperty(e, t, n) {
        (!(`value` in n) || n.configurable === !1 || n.enumerable === !1 || n.writable === !1) &&
          Ne();
        var i = r.get(t);
        return (
          i === void 0
            ? f(() => {
                var e = M(n.value, o);
                return (r.set(t, e), e);
              })
            : N(i, n.value, !0),
          !0
        );
      },
      deleteProperty(e, t) {
        var n = r.get(t);
        if (n === void 0) {
          if (t in e) {
            let e = f(() => M(v, o));
            (r.set(t, e), hn(a));
          }
        } else (N(n, v), hn(a));
        return !0;
      },
      get(t, n, i) {
        if (n === de) return e;
        var a = r.get(n),
          c = n in t;
        if (
          (a === void 0 &&
            (!c || s(t, n)?.writable) &&
            ((a = f(() => M(_n(c ? t[n] : v), o))), r.set(n, a)),
          a !== void 0)
        ) {
          var l = Q(a);
          return l === v ? void 0 : l;
        }
        return Reflect.get(t, n, i);
      },
      getOwnPropertyDescriptor(e, t) {
        var n = Reflect.getOwnPropertyDescriptor(e, t);
        if (n && `value` in n) {
          var i = r.get(t);
          i && (n.value = Q(i));
        } else if (n === void 0) {
          var a = r.get(t),
            o = a?.v;
          if (a !== void 0 && o !== v)
            return { enumerable: !0, configurable: !0, value: o, writable: !0 };
        }
        return n;
      },
      has(e, t) {
        if (t === de) return !0;
        var n = r.get(t),
          i = (n !== void 0 && n.v !== v) || Reflect.has(e, t);
        return (n !== void 0 || (W !== null && (!i || s(e, t)?.writable))) &&
          (n === void 0 && ((n = f(() => M(i ? _n(e[t]) : v, o))), r.set(t, n)), Q(n) === v)
          ? !1
          : i;
      },
      set(e, t, n, c) {
        var l = r.get(t),
          u = t in e;
        if (i && t === `length`)
          for (var d = n; d < l.v; d += 1) {
            var p = r.get(d + ``);
            p === void 0 ? d in e && ((p = f(() => M(v, o))), r.set(d + ``, p)) : N(p, v);
          }
        if (l === void 0)
          (!u || s(e, t)?.writable) && ((l = f(() => M(void 0, o))), N(l, _n(n)), r.set(t, l));
        else {
          u = l.v !== v;
          var m = f(() => _n(n));
          N(l, m);
        }
        var h = Reflect.getOwnPropertyDescriptor(e, t);
        if ((h?.set && h.set.call(c, n), !u)) {
          if (i && typeof t == `string`) {
            var g = r.get(`length`),
              _ = Number(t);
            Number.isInteger(_) && _ >= g.v && N(g, _ + 1);
          }
          hn(a);
        }
        return !0;
      },
      ownKeys(e) {
        Q(a);
        var t = Reflect.ownKeys(e).filter((e) => {
          var t = r.get(e);
          return t === void 0 || t.v !== v;
        });
        for (var [n, i] of r) i.v !== v && !(n in e) && t.push(n);
        return t;
      },
      setPrototypeOf() {
        Pe();
      },
    })
  );
}
var vn, yn, bn, xn;
function Sn() {
  if (vn === void 0) {
    ((vn = window), (yn = /Firefox/.test(navigator.userAgent)));
    var e = Element.prototype,
      t = Node.prototype,
      n = Text.prototype;
    ((bn = s(t, `firstChild`).get),
      (xn = s(t, `nextSibling`).get),
      d(e) && ((e[me] = void 0), (e[pe] = null), (e[he] = void 0), (e.__e = void 0)),
      d(n) && (n[ge] = void 0));
  }
}
function P(e = ``) {
  return document.createTextNode(e);
}
function F(e) {
  return bn.call(e);
}
function I(e) {
  return xn.call(e);
}
function Cn(e, t) {
  if (!y) return F(e);
  var n = F(x);
  if (n === null) n = x.appendChild(P());
  else if (t && n.nodeType !== 3) {
    var r = P();
    return (n?.before(r), S(r), r);
  }
  return (t && kn(n), S(n), n);
}
function wn(e, t = !1) {
  if (!y) {
    var n = F(e);
    return n instanceof Comment && n.data === `` ? I(n) : n;
  }
  if (t) {
    if (x?.nodeType !== 3) {
      var r = P();
      return (x?.before(r), S(r), r);
    }
    kn(x);
  }
  return x;
}
function Tn(e, t = 1, n = !1) {
  let r = y ? x : e;
  for (var i; t--; ) ((i = r), (r = I(r)));
  if (!y) return r;
  if (n) {
    if (r?.nodeType !== 3) {
      var a = P();
      return (r === null ? i?.after(a) : r.before(a), S(a), a);
    }
    kn(r);
  }
  return (S(r), r);
}
function En(e) {
  e.textContent = ``;
}
function Dn() {
  return !C || A !== null ? !1 : (W.f & ne) !== 0;
}
function On(e, t, n) {
  let r = n ? { is: n } : void 0;
  return document.createElementNS(t ?? `http://www.w3.org/1999/xhtml`, e, r);
}
function kn(e) {
  if (e.nodeValue.length < 65536) return;
  let t = e.nextSibling;
  for (; t !== null && t.nodeType === 3; )
    (t.remove(), (e.nodeValue += t.nodeValue), (t = e.nextSibling));
}
function An(e) {
  var t = V,
    n = W;
  (U(null), G(null));
  try {
    return e();
  } finally {
    (U(t), G(n));
  }
}
function jn(e) {
  (W === null && (V === null && we(e), Ce()), B && Se(e));
}
function Mn(e, t) {
  var n = t.last;
  n === null ? (t.last = t.first = e) : ((n.next = e), (e.prev = n), (t.last = e));
}
function L(e, t) {
  var n = W;
  n !== null && n.f & 8192 && (e |= ee);
  var r = {
    ctx: w,
    deps: null,
    nodes: null,
    f: e | g | 512,
    first: null,
    fn: t,
    last: null,
    next: null,
    parent: n,
    b: n && n.b,
    prev: null,
    teardown: null,
    wv: 0,
    ac: null,
  };
  O?.register_created_effect(r);
  var i = r;
  if (e & 4) Ot === null ? Mt.ensure().schedule(r) : Ot.push(r);
  else if (t !== null) {
    try {
      pr(r);
    } catch (e) {
      throw (z(r), e);
    }
    i.deps === null &&
      i.teardown === null &&
      i.nodes === null &&
      i.first === i.last &&
      !(i.f & 524288) &&
      ((i = i.first), e & 16 && e & 65536 && i !== null && (i.f |= ie));
  }
  if (i !== null && ((i.parent = n), n !== null && Mn(i, n), V !== null && V.f & 2 && !(e & 64))) {
    var a = V;
    (a.effects ??= []).push(i);
  }
  return r;
}
function Nn() {
  return V !== null && !H;
}
function Pn(e) {
  let t = L(8, null);
  return (D(t, h), (t.teardown = e), t);
}
function Fn(e) {
  jn(`$effect`);
  var t = W.f;
  if (!V && t & 32 && !(t & 32768)) {
    var n = w;
    (n.e ??= []).push(e);
  } else return In(e);
}
function In(e) {
  return L(4 | oe, e);
}
function Ln(e) {
  return (jn(`$effect.pre`), L(8 | oe, e));
}
function Rn(e) {
  Mt.ensure();
  let t = L(64 | ae, e);
  return (e = {}) =>
    new Promise((n) => {
      e.outro
        ? Yn(t, () => {
            (z(t), n(void 0));
          })
        : (z(t), n(void 0));
    });
}
function zn(e) {
  return L(4, e);
}
function Bn(e) {
  return L(le | ae, e);
}
function Vn(e, t = 0) {
  return L(8 | t, e);
}
function Hn(e, t = [], n = [], r = []) {
  qt(r, t, n, (t) => {
    L(8, () => e(...t.map(Q)));
  });
}
function Un(e, t = 0) {
  return L(16 | t, e);
}
function R(e) {
  return L(32 | ae, e);
}
function Wn(e) {
  var t = e.teardown;
  if (t !== null) {
    let e = B,
      n = V;
    (nr(!0), U(null));
    try {
      t.call(null);
    } finally {
      (nr(e), U(n));
    }
  }
}
function Gn(e, t = !1) {
  var n = e.first;
  for (e.first = e.last = null; n !== null; ) {
    let e = n.ac;
    e !== null &&
      An(() => {
        e.abort(_e);
      });
    var r = n.next;
    (n.f & 64 ? (n.parent = null) : z(n, t), (n = r));
  }
}
function Kn(e) {
  for (var t = e.first; t !== null; ) {
    var n = t.next;
    (t.f & 32 || z(t), (t = n));
  }
}
function z(e, t = !0) {
  var n = !1;
  ((t || e.f & 262144) &&
    e.nodes !== null &&
    e.nodes.end !== null &&
    (qn(e.nodes.start, e.nodes.end), (n = !0)),
    D(e, re),
    Gn(e, t && !n),
    fr(e, 0));
  var r = e.nodes && e.nodes.t;
  if (r !== null) for (let e of r) e.stop();
  (Wn(e), (e.f ^= re), (e.f |= te));
  var i = e.parent;
  (i !== null && i.first !== null && Jn(e),
    (e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null));
}
function qn(e, t) {
  for (; e !== null; ) {
    var n = e === t ? null : I(e);
    (e.remove(), (e = n));
  }
}
function Jn(e) {
  var t = e.parent,
    n = e.prev,
    r = e.next;
  (n !== null && (n.next = r),
    r !== null && (r.prev = n),
    t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n)));
}
function Yn(e, t, n = !0) {
  var r = [];
  Xn(e, r, !0);
  var i = () => {
      (n && z(e), t && t());
    },
    a = r.length;
  if (a > 0) {
    var o = () => --a || i();
    for (var s of r) s.out(o);
  } else i();
}
function Xn(e, t, n) {
  if (!(e.f & 8192)) {
    e.f ^= ee;
    var r = e.nodes && e.nodes.t;
    if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
    for (var i = e.first; i !== null; ) {
      var a = i.next;
      if (!(i.f & 64)) {
        var o = (i.f & 65536) != 0 || ((i.f & 32) != 0 && (e.f & 16) != 0);
        Xn(i, t, o ? n : !1);
      }
      i = a;
    }
  }
}
function Zn(e) {
  Qn(e, !0);
}
function Qn(e, t) {
  if (e.f & 8192) {
    ((e.f ^= ee), e.f & 1024 || (D(e, g), Mt.ensure().schedule(e)));
    for (var n = e.first; n !== null; ) {
      var r = n.next,
        i = (n.f & 65536) != 0 || (n.f & 32) != 0;
      (Qn(n, i ? t : !1), (n = r));
    }
    var a = e.nodes && e.nodes.t;
    if (a !== null) for (let e of a) (e.is_global || t) && e.in();
  }
}
function $n(e, t) {
  if (e.nodes)
    for (var n = e.nodes.start, r = e.nodes.end; n !== null; ) {
      var i = n === r ? null : I(n);
      (t.append(n), (n = i));
    }
}
var er = null,
  tr = !1,
  B = !1;
function nr(e) {
  B = e;
}
var V = null,
  H = !1;
function U(e) {
  V = e;
}
var W = null;
function G(e) {
  W = e;
}
var K = null;
function rr(e) {
  V !== null && (!C || V.f & 2) && (K === null ? (K = [e]) : K.push(e));
}
var q = null,
  J = 0,
  Y = null;
function ir(e) {
  Y = e;
}
var ar = 1,
  X = 0,
  Z = X;
function or(e) {
  Z = e;
}
function sr() {
  return ++ar;
}
function cr(e) {
  var t = e.f;
  if (t & 2048) return !0;
  if ((t & 2 && (e.f &= ~se), t & 4096)) {
    for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
      var a = n[i];
      if ((cr(a) && an(a), a.wv > e.wv)) return !0;
    }
    t & 512 && k === null && D(e, h);
  }
  return !1;
}
function lr(e, t, n = !0) {
  var r = e.reactions;
  if (r !== null && !(!C && K !== null && i.call(K, e)))
    for (var a = 0; a < r.length; a++) {
      var o = r[a];
      o.f & 2 ? lr(o, t, !1) : t === o && (n ? D(o, g) : o.f & 1024 && D(o, _), zt(o));
    }
}
function ur(e) {
  var t = q,
    n = J,
    r = Y,
    i = V,
    a = K,
    o = w,
    s = H,
    c = Z,
    l = e.f;
  ((q = null),
    (J = 0),
    (Y = null),
    (V = l & 96 ? null : e),
    (K = null),
    Qe(e.ctx),
    (H = !1),
    (Z = ++X),
    e.ac !== null &&
      (An(() => {
        e.ac.abort(_e);
      }),
      (e.ac = null)));
  try {
    e.f |= ce;
    var u = e.fn,
      d = u();
    e.f |= ne;
    var f = e.deps,
      p = O?.is_fork;
    if (q !== null) {
      var m;
      if ((p || fr(e, J), f !== null && J > 0))
        for (f.length = J + q.length, m = 0; m < q.length; m++) f[J + m] = q[m];
      else e.deps = f = q;
      if (Nn() && e.f & 512) for (m = J; m < f.length; m++) (f[m].reactions ??= []).push(e);
    } else !p && f !== null && J < f.length && (fr(e, J), (f.length = J));
    if (ot() && Y !== null && !H && f !== null && !(e.f & 6146))
      for (m = 0; m < Y.length; m++) lr(Y[m], e);
    if (i !== null && i !== e) {
      if ((X++, i.deps !== null)) for (let e = 0; e < n; e += 1) i.deps[e].rv = X;
      if (t !== null) for (let e of t) e.rv = X;
      Y !== null && (r === null ? (r = Y) : r.push(...Y));
    }
    return (e.f & 8388608 && (e.f ^= ue), d);
  } catch (e) {
    return ft(e);
  } finally {
    ((e.f ^= ce), (q = t), (J = n), (Y = r), (V = i), (K = a), Qe(o), (H = s), (Z = c));
  }
}
function dr(e, t) {
  let n = t.reactions;
  if (n !== null) {
    var a = r.call(n, e);
    if (a !== -1) {
      var o = n.length - 1;
      o === 0 ? (n = t.reactions = null) : ((n[a] = n[o]), n.pop());
    }
  }
  if (n === null && t.f & 2 && (q === null || !i.call(q, t))) {
    var s = t;
    (s.f & 512 && ((s.f ^= 512), (s.f &= ~se)), s.v !== v && mt(s), on(s), fr(s, 0));
  }
}
function fr(e, t) {
  var n = e.deps;
  if (n !== null) for (var r = t; r < n.length; r++) dr(e, n[r]);
}
function pr(e) {
  var t = e.f;
  if (!(t & 16384)) {
    D(e, h);
    var n = W,
      r = tr;
    ((W = e), (tr = !0));
    try {
      (t & 16777232 ? Kn(e) : Gn(e), Wn(e));
      var i = ur(e);
      ((e.teardown = typeof i == `function` ? i : null), (e.wv = ar));
    } finally {
      ((tr = r), (W = n));
    }
  }
}
async function mr() {
  if (C)
    return new Promise((e) => {
      (requestAnimationFrame(() => e()), setTimeout(() => e()));
    });
  (await Promise.resolve(), Nt());
}
function hr() {
  return Mt.ensure().settled();
}
function Q(e) {
  var t = (e.f & 2) != 0;
  if (
    (er?.add(e), V !== null && !H && !(W !== null && W.f & 16384) && (K === null || !i.call(K, e)))
  ) {
    var n = V.deps;
    if (V.f & 2097152)
      e.rv < X &&
        ((e.rv = X),
        q === null && n !== null && n[J] === e ? J++ : q === null ? (q = [e]) : q.push(e));
    else {
      ((V.deps ??= []), i.call(V.deps, e) || V.deps.push(e));
      var r = e.reactions;
      r === null ? (e.reactions = [V]) : i.call(r, V) || r.push(V);
    }
  }
  if (B && j.has(e)) return j.get(e);
  if (t) {
    var a = e;
    if (B) {
      var o = a.v;
      return (((!(a.f & 1024) && a.reactions !== null) || _r(a)) && (o = rn(a)), j.set(a, o), o);
    }
    var s = (a.f & 512) == 0 && !H && V !== null && (tr || (V.f & 512) != 0),
      c = (a.f & ne) === 0;
    (cr(a) && (s && (a.f |= 512), an(a)), s && !c && (sn(a), gr(a)));
  }
  if (k?.has(e)) return k.get(e);
  if (e.f & 8388608) throw e.v;
  return e.v;
}
function gr(e) {
  if (((e.f |= 512), e.deps !== null))
    for (let t of e.deps) ((t.reactions ??= []).push(e), t.f & 2 && !(t.f & 512) && (sn(t), gr(t)));
}
function _r(e) {
  if (e.v === v) return !0;
  if (e.deps === null) return !1;
  for (let t of e.deps) if (j.has(t) || (t.f & 2 && _r(t))) return !0;
  return !1;
}
function vr(e) {
  var t = H;
  try {
    return ((H = !0), e());
  } finally {
    H = t;
  }
}
[
  ...`allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback`.split(
    `.`,
  ),
];
var yr = [`touchstart`, `touchmove`];
function br(e) {
  return yr.includes(e);
}
var xr = Symbol(`events`),
  Sr = new Set(),
  Cr = new Set();
function wr(e, t, n) {
  (t[xr] ??= {})[e] = n;
}
function Tr(e) {
  for (var t = 0; t < e.length; t++) Sr.add(e[t]);
  for (var n of Cr) n(e);
}
var Er = null;
function Dr(e) {
  var t = this,
    n = t.ownerDocument,
    r = e.type,
    i = e.composedPath?.() || [],
    a = i[0] || e.target;
  Er = e;
  var s = 0,
    c = Er === e && e[xr];
  if (c) {
    var l = i.indexOf(c);
    if (l !== -1 && (t === document || t === window)) {
      e[xr] = t;
      return;
    }
    var u = i.indexOf(t);
    if (u === -1) return;
    l <= u && (s = l);
  }
  if (((a = i[s] || e.target), a !== t)) {
    o(e, `currentTarget`, {
      configurable: !0,
      get() {
        return a || n;
      },
    });
    var d = V,
      f = W;
    (U(null), G(null));
    try {
      for (var p, m = []; a !== null; ) {
        var h = a.assignedSlot || a.parentNode || a.host || null;
        try {
          var g = a[xr]?.[r];
          g != null && (!a.disabled || e.target === a) && g.call(a, e);
        } catch (e) {
          p ? m.push(e) : (p = e);
        }
        if (e.cancelBubble || h === t || h === null) break;
        a = h;
      }
      if (p) {
        for (let e of m)
          queueMicrotask(() => {
            throw e;
          });
        throw p;
      }
    } finally {
      ((e[xr] = t), delete e.currentTarget, U(d), G(f));
    }
  }
}
var Or =
  globalThis?.window?.trustedTypes &&
  globalThis.window.trustedTypes.createPolicy(`svelte-trusted-html`, { createHTML: (e) => e });
function kr(e) {
  return Or?.createHTML(e) ?? e;
}
function Ar(e) {
  var t = On(`template`);
  return ((t.innerHTML = kr(e.replaceAll(`<!>`, `<!---->`))), t.content);
}
function $(e, t) {
  var n = W;
  n.nodes === null && (n.nodes = { start: e, end: t, a: null, t: null });
}
function jr(e, t) {
  var n = (t & 1) != 0,
    r = (t & 2) != 0,
    i,
    a = !e.startsWith(`<!>`);
  return () => {
    if (y) return ($(x, null), x);
    i === void 0 && ((i = Ar(a ? e : `<!>` + e)), n || (i = F(i)));
    var t = r || yn ? document.importNode(i, !0) : i.cloneNode(!0);
    if (n) {
      var o = F(t),
        s = t.lastChild;
      $(o, s);
    } else $(t, t);
    return t;
  };
}
function Mr(e = ``) {
  if (!y) {
    var t = P(e + ``);
    return ($(t, t), t);
  }
  var n = x;
  return (n.nodeType === 3 ? kn(n) : (n.before((n = P())), S(n)), $(n, n), n);
}
function Nr() {
  if (y) return ($(x, null), x);
  var e = document.createDocumentFragment(),
    t = document.createComment(``),
    n = P();
  return (e.append(t, n), $(t, n), e);
}
function Pr(e, t) {
  if (y) {
    var n = W;
    ((!(n.f & 32768) || n.nodes.end === null) && (n.nodes.end = x), He());
    return;
  }
  e !== null && e.before(t);
}
function Fr(e, t) {
  var n = t == null ? `` : typeof t == `object` ? `${t}` : t;
  n !== (e[ge] ??= e.nodeValue) && ((e[ge] = n), (e.nodeValue = `${n}`));
}
function Ir(e, t) {
  return zr(e, t);
}
function Lr(e, t) {
  (Sn(), (t.intro = t.intro ?? !1));
  let n = t.target,
    r = y,
    i = x;
  try {
    for (var a = F(n); a && (a.nodeType !== 8 || a.data !== `[`); ) a = I(a);
    if (!a) throw Le;
    (b(!0), S(a));
    let r = zr(e, { ...t, anchor: a });
    return (b(!1), r);
  } catch (r) {
    if (
      r instanceof Error &&
      r.message
        .split(
          `
`,
        )
        .some((e) => e.startsWith(`https://svelte.dev/e/`))
    )
      throw r;
    return (
      r !== Le && console.warn(`Failed to hydrate: `, r),
      t.recover === !1 && ke(),
      Sn(),
      En(n),
      b(!1),
      Ir(e, t)
    );
  } finally {
    (b(r), S(i));
  }
}
var Rr = new Map();
function zr(
  e,
  { target: t, anchor: n, props: r = {}, events: i, context: o, intro: s = !0, transformError: c },
) {
  Sn();
  var l = void 0,
    u = Rn(() => {
      var s = n ?? t.appendChild(P());
      Gt(
        s,
        { pending: () => {} },
        (t) => {
          it({});
          var n = w;
          if (
            (o && (n.c = o),
            i && (r.$$events = i),
            y && $(t, null),
            (l = e(t, r) || {}),
            y && ((W.nodes.end = x), x === null || x.nodeType !== 8 || x.data !== `]`))
          )
            throw (Be(), Le);
          at();
        },
        c,
      );
      var u = new Set(),
        d = (e) => {
          for (var n = 0; n < e.length; n++) {
            var r = e[n];
            if (!u.has(r)) {
              u.add(r);
              var i = br(r);
              for (let e of [t, document]) {
                var a = Rr.get(e);
                a === void 0 && ((a = new Map()), Rr.set(e, a));
                var o = a.get(r);
                o === void 0
                  ? (e.addEventListener(r, Dr, { passive: i }), a.set(r, 1))
                  : a.set(r, o + 1);
              }
            }
          }
        };
      return (
        d(a(Sr)),
        Cr.add(d),
        () => {
          for (var e of u)
            for (let n of [t, document]) {
              var r = Rr.get(n),
                i = r.get(e);
              --i == 0
                ? (n.removeEventListener(e, Dr), r.delete(e), r.size === 0 && Rr.delete(n))
                : r.set(e, i);
            }
          (Cr.delete(d), s !== n && s.parentNode?.removeChild(s));
        }
      );
    });
  return (Br.set(l, u), l);
}
var Br = new WeakMap();
function Vr(e, t) {
  let n = Br.get(e);
  return n ? (Br.delete(e), n(t)) : Promise.resolve();
}
var Hr = class {
  anchor;
  #e = new Map();
  #t = new Map();
  #n = new Map();
  #r = new Set();
  #i = !0;
  constructor(e, t = !0) {
    ((this.anchor = e), (this.#i = t));
  }
  #a = (e) => {
    if (this.#e.has(e)) {
      var t = this.#e.get(e),
        n = this.#t.get(t);
      if (n) (Zn(n), this.#r.delete(t));
      else {
        var r = this.#n.get(t);
        r &&
          (this.#t.set(t, r.effect),
          this.#n.delete(t),
          r.fragment.lastChild.remove(),
          this.anchor.before(r.fragment),
          (n = r.effect));
      }
      for (let [t, n] of this.#e) {
        if ((this.#e.delete(t), t === e)) break;
        let r = this.#n.get(n);
        r && (z(r.effect), this.#n.delete(n));
      }
      for (let [e, r] of this.#t) {
        if (e === t || this.#r.has(e)) continue;
        let i = () => {
          if (Array.from(this.#e.values()).includes(e)) {
            var t = document.createDocumentFragment();
            ($n(r, t), t.append(P()), this.#n.set(e, { effect: r, fragment: t }));
          } else z(r);
          (this.#r.delete(e), this.#t.delete(e));
        };
        this.#i || !n ? (this.#r.add(e), Yn(r, i, !1)) : i();
      }
    }
  };
  #o = (e) => {
    this.#e.delete(e);
    let t = Array.from(this.#e.values());
    for (let [e, n] of this.#n) t.includes(e) || (z(n.effect), this.#n.delete(e));
  };
  ensure(e, t) {
    var n = O,
      r = Dn();
    if (t && !this.#t.has(e) && !this.#n.has(e))
      if (r) {
        var i = document.createDocumentFragment(),
          a = P();
        (i.append(a), this.#n.set(e, { effect: R(() => t(a)), fragment: i }));
      } else
        this.#t.set(
          e,
          R(() => t(this.anchor)),
        );
    if ((this.#e.set(n, e), r)) {
      for (let [t, r] of this.#t) t === e ? n.unskip_effect(r) : n.skip_effect(r);
      for (let [t, r] of this.#n) t === e ? n.unskip_effect(r.effect) : n.skip_effect(r.effect);
      (n.oncommit(this.#a), n.ondiscard(this.#o));
    } else (y && (this.anchor = x), this.#a(n));
  }
};
function Ur(e, t, n = !1) {
  var r;
  y && ((r = x), He());
  var i = new Hr(e),
    a = n ? ie : 0;
  function o(e, t) {
    if (y) {
      var n = Ke(r);
      if (e !== parseInt(n.substring(1))) {
        var a = Ge();
        (S(a), (i.anchor = a), b(!1), i.ensure(e, t), b(!0));
        return;
      }
    }
    i.ensure(e, t);
  }
  Un(() => {
    var e = !1;
    (t((t, n = 0) => {
      ((e = !0), o(n, t));
    }),
      e || o(-1, null));
  }, a);
}
function Wr(e, t, ...n) {
  var r = new Hr(e);
  Un(() => {
    let e = t() ?? null;
    r.ensure(e, e && ((t) => e(t, ...n)));
  }, ie);
}
function Gr(e) {
  return (t, ...n) => {
    var r = e(...n),
      i;
    y ? ((i = x), He()) : ((i = F(Ar(r.render().trim()))), t.before(i));
    let a = r.setup?.(i);
    ($(i, i), typeof a == `function` && Pn(a));
  };
}
function Kr(e, t, n) {
  var r;
  y && ((r = x), He());
  var i = new Hr(e);
  Un(() => {
    var e = t() ?? null;
    if (y && (Ke(r) === `[`) != (e !== null)) {
      var a = Ge();
      (S(a), (i.anchor = a), b(!1), i.ensure(e, e && ((t) => n(t, e))), b(!0));
      return;
    }
    i.ensure(e, e && ((t) => n(t, e)));
  }, ie);
}
function qr(e, t) {
  return e === t || e?.[de] === t;
}
function Jr(e = {}, t, n, r) {
  var i = w.r,
    a = W;
  return (
    zn(() => {
      var o, s;
      return (
        Vn(() => {
          ((o = s),
            (s = r?.() || []),
            vr(() => {
              qr(n(...s), e) || (t(e, ...s), o && qr(n(...o), e) && t(null, ...o));
            }));
        }),
        () => {
          let r = a;
          for (; r !== i && r.parent !== null && r.parent.f & 33554432; ) r = r.parent;
          let o = () => {
              s && qr(n(...s), e) && t(null, ...s);
            },
            c = r.teardown;
          r.teardown = () => {
            (o(), c?.());
          };
        }
      );
    }),
    e
  );
}
function Yr(e, t, n, r) {
  var i = !Xe || (n & 2) != 0,
    a = (n & 8) != 0,
    o = (n & 16) != 0,
    c = r,
    l = !0,
    u = void 0,
    d = () => (o && i ? ((u ??= Zt(r)), Q(u)) : (l && ((l = !1), (c = o ? vr(r) : r)), c));
  let f;
  if (a) {
    var p = de in e || fe in e;
    f = s(e, t)?.set ?? (p && t in e ? (n) => (e[t] = n) : void 0);
  }
  var m,
    h = !1;
  (a ? ([m, h] = xt(() => e[t])) : (m = e[t]),
    m === void 0 && r !== void 0 && ((m = d()), f && (i && je(t), f(m))));
  var g = i
    ? () => {
        var n = e[t];
        return n === void 0 ? d() : ((l = !0), n);
      }
    : () => {
        var n = e[t];
        return (n !== void 0 && (c = void 0), n === void 0 ? c : n);
      };
  if (i && !(n & 4)) return g;
  if (f) {
    var _ = e.$$legacy;
    return function (e, t) {
      return arguments.length > 0 ? ((!i || !t || _ || h) && f(t ? g() : e), e) : g();
    };
  }
  var ee = !1,
    te = (n & 1 ? Zt : tn)(() => ((ee = !1), g()));
  a && Q(te);
  var ne = W;
  return function (e, t) {
    if (arguments.length > 0) {
      let n = t ? Q(te) : i && a ? _n(e) : e;
      return (N(te, n), (ee = !0), c !== void 0 && (c = n), e);
    }
    return (B && ee) || ne.f & 16384 ? te.v : Q(te);
  };
}
function Xr(e) {
  return class extends Zr {
    constructor(t) {
      super({ component: e, ...t });
    }
  };
}
var Zr = class {
  #e;
  #t;
  constructor(e) {
    var t = new Map(),
      n = (e, n) => {
        var r = fn(n, !1, !1);
        return (t.set(e, r), r);
      };
    let r = new Proxy(
      { ...(e.props || {}), $$events: {} },
      {
        get(e, r) {
          return Q(t.get(r) ?? n(r, Reflect.get(e, r)));
        },
        has(e, r) {
          return r === fe ? !0 : (Q(t.get(r) ?? n(r, Reflect.get(e, r))), Reflect.has(e, r));
        },
        set(e, r, i) {
          return (N(t.get(r) ?? n(r, i), i), Reflect.set(e, r, i));
        },
      },
    );
    ((this.#t = (e.hydrate ? Lr : Ir)(e.component, {
      target: e.target,
      anchor: e.anchor,
      props: r,
      context: e.context,
      intro: e.intro ?? !1,
      recover: e.recover,
      transformError: e.transformError,
    })),
      !C && (!e?.props?.$$host || e.sync === !1) && Nt(),
      (this.#e = r.$$events));
    for (let e of Object.keys(this.#t))
      e === `$set` ||
        e === `$destroy` ||
        e === `$on` ||
        o(this, e, {
          get() {
            return this.#t[e];
          },
          set(t) {
            this.#t[e] = t;
          },
          enumerable: !0,
        });
    ((this.#t.$set = (e) => {
      Object.assign(r, e);
    }),
      (this.#t.$destroy = () => {
        Vr(this.#t);
      }));
  }
  $set(e) {
    this.#t.$set(e);
  }
  $on(e, t) {
    this.#e[e] = this.#e[e] || [];
    let n = (...e) => t.call(this, ...e);
    return (
      this.#e[e].push(n),
      () => {
        this.#e[e] = this.#e[e].filter((e) => e !== n);
      }
    );
  }
  $destroy() {
    this.#t.$destroy();
  }
};
function Qr(e, t) {
  if ((C || ve(`hydratable`), y)) {
    let t = window.__svelte?.h;
    if (t?.has(e)) return t.get(e);
    ze(e);
  }
  return t();
}
var $r = t({
  afterUpdate: () => oi,
  beforeUpdate: () => ai,
  createContext: () => $e,
  createEventDispatcher: () => ii,
  createRawSnippet: () => Gr,
  flushSync: () => Nt,
  fork: () => Ht,
  getAbortSignal: () => ei,
  getAllContexts: () => rt,
  getContext: () => et,
  hasContext: () => nt,
  hydratable: () => Qr,
  hydrate: () => Lr,
  mount: () => Ir,
  onDestroy: () => ni,
  onMount: () => ti,
  setContext: () => tt,
  settled: () => hr,
  tick: () => mr,
  unmount: () => Vr,
  untrack: () => vr,
});
function ei() {
  return (V === null && Oe(), (V.ac ??= new AbortController()).signal);
}
function ti(e) {
  (w === null && ye(`onMount`),
    Xe && w.l !== null
      ? si(w).m.push(e)
      : Fn(() => {
          let t = vr(e);
          if (typeof t == `function`) return t;
        }));
}
function ni(e) {
  (w === null && ye(`onDestroy`), ti(() => () => vr(e)));
}
function ri(e, t, { bubbles: n = !1, cancelable: r = !1 } = {}) {
  return new CustomEvent(e, { detail: t, bubbles: n, cancelable: r });
}
function ii() {
  let e = w;
  return (
    e === null && ye(`createEventDispatcher`),
    (t, r, i) => {
      let a = e.s.$$events?.[t];
      if (a) {
        let o = n(a) ? a.slice() : [a],
          s = ri(t, r, i);
        for (let t of o) t.call(e.x, s);
        return !s.defaultPrevented;
      }
      return !0;
    }
  );
}
function ai(e) {
  (w === null && ye(`beforeUpdate`), w.l === null && Ae(`beforeUpdate`), si(w).b.push(e));
}
function oi(e) {
  (w === null && ye(`afterUpdate`), w.l === null && Ae(`afterUpdate`), si(w).a.push(e));
}
function si(e) {
  var t = e.l;
  return (t.u ??= { a: [], b: [], m: [] });
}
export {
  et as A,
  Cn as C,
  M as D,
  N as E,
  Ue as F,
  it as M,
  tt as N,
  en as O,
  Ze as P,
  Ln as S,
  Tn as T,
  hr as _,
  Jr as a,
  Hn as b,
  Ur as c,
  Nr as d,
  jr as f,
  Q as g,
  wr as h,
  Yr as i,
  at as j,
  vt as k,
  Fr as l,
  Tr as m,
  ti as n,
  Kr as o,
  Mr as p,
  Xr as r,
  Wr as s,
  $r as t,
  Pr as u,
  mr as v,
  wn as w,
  Fn as x,
  vr as y,
};
