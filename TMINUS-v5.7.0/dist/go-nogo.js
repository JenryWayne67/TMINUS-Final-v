// Go/No-Go poll before launch. Pure logic: each of the four crew reports from their own numbers.
// Any NO-GO blocks launch; CAUTION lets you launch but says what it will cost.
import {SPECIALISTS, routeBudget} from './expedition-core.js';
import {designSheet, TWR_GO} from './design-science.js';

// Which design checks each crew member answers for (indexes match SPECIALISTS).
export const POLL_CHECKS = [['twr', 'dv'], ['power', 'battery'], ['downlink'], ['o2']];
export const RANK = {go: 0, caution: 1, nogo: 2};
export const worst = list => list.reduce((a, s) => (RANK[s] > RANK[a] ? s : a), 'go');
export const CALL = {go: 'GO', caution: 'GO, WITH CAUTION', nogo: 'NO-GO'};

export function goNoGo(state, routeId) {
  const sheet = designSheet(state), route = routeBudget(state, routeId);
  const byId = Object.fromEntries(sheet.checks.map(c => [c.id, c]));
  const roles = POLL_CHECKS.map((ids, i) => {
    const items = ids.map(id => ({
      label: byId[id].label, status: byId[id].status, room: byId[id].room, why: byId[id].why,
      value: byId[id].value, unit: byId[id].unit, limit: byId[id].limit, id
    }));
    if (i === 0) {                                              // the pilot also answers for the route
      const need = route.dv + 95;
      items.push({id: 'route-dv', label: 'Route delta-v', room: 'engine_bay', value: sheet.deltaV, unit: 'm/s', limit: `≥ ${need} (route ${route.dv} + return 95)`,
        status: sheet.deltaV >= need * 1.15 ? 'go' : sheet.deltaV >= need ? 'caution' : 'nogo',
        why: 'The ship needs enough delta-v for the outbound burn plus the return burn, with 15% in hand.'});
      items.push({id: 'route-fuel', label: 'Route fuel margin', room: 'engine_bay', value: route.margin, unit: 'kg', limit: '≥ 5',
        status: !route.valid ? 'nogo' : route.margin < 5 ? 'caution' : 'go',
        why: 'Propellant left after the outbound burn, the return reserve, contingency and any slow-climb loss.'});
      if (route.slowClimb > 0) items.push({id: 'slow-climb', label: 'Slow climb', room: 'engine_bay', value: route.slowClimb, unit: 'kg extra fuel', limit: `thrust-to-weight under ${TWR_GO}`,
        status: 'caution', why: 'Below the GO thrust-to-weight the ship fights gravity for longer and burns extra propellant on the way up.'});
    }
    const status = worst(items.map(x => x.status));
    return {id: i, name: SPECIALISTS[i].name, role: SPECIALISTS[i].role, status, call: CALL[status], items};
  });
  const status = worst(roles.map(r => r.status));
  return {route, sheet, roles, status, canLaunch: status !== 'nogo', cautions: roles.flatMap(r => r.items.filter(x => x.status === 'caution'))};
}
