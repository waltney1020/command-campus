/* Mapping layer: heartbeats + card settings -> display status and light color.
   A physical light can call CCMap.lights(cards, beatsByCard) or read the same
   `heartbeats` table (latest row per card_id) and run CCMap.derive. Colors are
   working=green, idle=red (flash), needs/needs_you=amber. */
(function (root) {
  function beatTime(b) {
    if (!b) return 0;
    var t = b.updated_at;
    if (typeof t === 'number') return t;
    var p = Date.parse(t);
    return isNaN(p) ? 0 : p;
  }
  var COLORS = { working: 'green', idle: 'red', needs: 'amber' };
  var Map = {
    colors: COLORS,
    beatTime: beatTime,
    fromHeartbeatStatus: function (s) {
      if (s === 'needs_you' || s === 'needs') return 'needs';
      if (s === 'working') return 'working';
      return 'idle';
    },
    toHeartbeatStatus: function (s) {
      return s === 'needs' ? 'needs_you' : (s === 'working' ? 'working' : 'idle');
    },
    latestByCard: function (beats) {
      var m = {};
      (beats || []).forEach(function (b) {
        if (!b || !b.card_id) return;
        if (!m[b.card_id] || beatTime(b) >= beatTime(m[b.card_id])) m[b.card_id] = b;
      });
      return m;
    },
    derive: function (card, lastBeat, now) {
      now = now || Date.now();
      if (!card || card.status_mode !== 'auto') {
        var st = (card && card.status) || 'idle';
        return { status: st, source: 'manual', color: COLORS[st] || 'red', beat: lastBeat || null, stale: false };
      }
      var n = Math.max(1, Number(card.heartbeat_minutes) || 10) * 60000;
      if (!lastBeat) return { status: 'idle', source: 'auto', color: 'red', beat: null, stale: true };
      var age = now - beatTime(lastBeat);
      if (age > n) return { status: 'idle', source: 'auto', color: 'red', beat: lastBeat, stale: true };
      var s = Map.fromHeartbeatStatus(lastBeat.status);
      return { status: s, source: 'auto', color: COLORS[s], beat: lastBeat, stale: false };
    },
    lights: function (cards, beats, now) {
      var by = Array.isArray(beats) ? Map.latestByCard(beats) : (beats || {});
      return (cards || []).map(function (c) {
        var d = Map.derive(c, by[c.id], now);
        return { card_id: c.id, name: c.name, status: d.status, color: d.color, source: d.source, stale: d.stale, updated_at: d.beat ? beatTime(d.beat) : (c.updated_at || 0) };
      });
    }
  };
  root.CCMap = Map;
  if (typeof module !== 'undefined') module.exports = Map;
})(typeof window !== 'undefined' ? window : globalThis);
