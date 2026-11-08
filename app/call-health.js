(function (root) {
  function createRecovery({ getState, negotiate, allowed = () => true, timers = globalThis, onExhausted = () => {} }) {
    let timer = null, attempts = 0, busy = false, disposed = false, generation = 0;
    function clear() { if (timer !== null) timers.clearTimeout(timer); timer = null; }
    function schedule(delay) { clear(); timer = timers.setTimeout(() => { timer = null; void retry(); }, delay); }
    async function retry(force = false) {
      if (disposed || busy || !allowed()) return;
      if (getState() === 'closed') return;
      if (!force && getState() === 'connected') { attempts = 0; clear(); return; }
      if (attempts >= 3) { onExhausted(); return; }
      const epoch = generation;
      busy = true;
      try { await negotiate(); attempts++; }
      catch { attempts++; }
      finally {
        busy = false;
        if (!disposed && epoch === generation && getState() !== 'connected' && getState() !== 'closed') schedule(4000 * Math.max(1, attempts));
      }
    }
    return {
      changed() {
        const state = getState();
        if (state === 'connected') { generation++; attempts = 0; clear(); }
        else if (state === 'failed') schedule(0);
        else if (state === 'disconnected') schedule(4000);
        else if (state === 'closed') { disposed = true; clear(); }
      },
      recover() { attempts = 0; clear(); return retry(true); },
      dispose() { disposed = true; generation++; clear(); },
    };
  }

  // Packet loss uses the interval between samples, not lifetime totals.
  function summarizeStats(report, previous = new Map()) {
    let rtt = null, jitter = null, lost = 0, received = 0, sampled = false;
    const next = new Map();
    const entries = [...report.values()];
    const selected = entries.find(row => row.type === 'transport' && row.selectedCandidatePairId)?.selectedCandidatePairId;
    for (const row of entries) {
      if (row.type === 'candidate-pair' && row.state === 'succeeded' && (row.id === selected || (!selected && row.nominated)) && Number.isFinite(row.currentRoundTripTime)) rtt = row.currentRoundTripTime * 1000;
      if (row.type !== 'inbound-rtp' || (row.kind || row.mediaType) !== 'audio' || row.isRemote) continue;
      if (Number.isFinite(row.jitter)) jitter = Math.max(jitter || 0, row.jitter * 1000);
      const count = { lost: Number(row.packetsLost) || 0, received: Number(row.packetsReceived) || 0 };
      next.set(row.id, count);
      const old = previous.get(row.id);
      if (old && count.received >= old.received) {
        lost += Math.max(0, count.lost - old.lost); received += count.received - old.received; sampled = true;
      }
    }
    const loss = sampled && lost + received > 0 ? lost * 100 / (lost + received) : null;
    const known = rtt !== null || jitter !== null || loss !== null;
    const grade = !known ? 'unknown' : rtt > 400 || jitter > 80 || loss > 5 ? 'poor' : rtt > 200 || jitter > 35 || loss > 2 ? 'fair' : 'good';
    return { rtt, jitter, loss, grade, next };
  }
  const api = { createRecovery, summarizeStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.aloCallHealth = api;
})(typeof window === 'undefined' ? globalThis : window);
