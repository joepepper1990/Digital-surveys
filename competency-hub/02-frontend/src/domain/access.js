// Who the user is and what they may do (plan E.0, E.2, K4.1). The server remains the real boundary;
// these rules decide what the screen offers. Identity fails closed: no guessed role, no default access.
CH.access = (function () {
  var MESSAGES = {
    NOT_REGISTERED: 'Your account has not been set up in the Competency Hub yet.',
    DUPLICATE: 'Your account appears more than once in the Competency Hub, so your access cannot be confirmed.',
    LEFT: 'Your account is marked as having left the group.',
    UNAVAILABLE: 'The Competency Hub could not confirm your access right now.'
  };

  // currentUser: { Id }. peopleRows: People list rows. Returns { ok, reason, person }.
  function resolveIdentity(currentUser, peopleRows) {
    if (!currentUser || !currentUser.Id) return { ok: false, reason: 'UNAVAILABLE' };
    var matches = (peopleRows || []).filter(function (p) { return Number(p.SiteUserId) === Number(currentUser.Id); });
    if (matches.length === 0) return { ok: false, reason: 'NOT_REGISTERED' };
    if (matches.length > 1) return { ok: false, reason: 'DUPLICATE' };
    if (matches[0].Status !== 'Active') return { ok: false, reason: 'LEFT' };
    if (['Engineer', 'Technician', 'Team Leader', 'Group Head'].indexOf(matches[0].Role) < 0) return { ok: false, reason: 'UNAVAILABLE' };
    return { ok: true, person: matches[0] };
  }

  // areasByKey: { FLK: { status } }. memberships: active rows { areaKey, canManageMeetings }.
  function build(person, memberships, areasByKey) {
    var role = person.Role;
    var management = CH.config.managementRoles.indexOf(role) >= 0;
    var member = {};
    var meetingAdmin = {};
    memberships.forEach(function (m) {
      member[m.areaKey] = true;
      if (m.canManageMeetings) meetingAdmin[m.areaKey] = true;
    });

    function active(key) { return !!areasByKey[key] && areasByKey[key].status === 'Active'; }

    return {
      role: role,
      isManagement: management,
      isEngineer: role === 'Engineer',
      isAdministrator: !!person.IsAdministrator,
      memberAreas: Object.keys(member).filter(active),
      isMember: function (key) { return !!member[key]; },
      // Members, Team Leaders and the Group Head may add and change things in an active area.
      canWrite: function (key) { return active(key) && (management || !!member[key]); },
      // Every active user may post on any active area's noticeboard unless an administrator has turned
      // their "Can post notices" switch off (spec §4.4); SharePoint enforces the same through Notice Posters.
      canPostNotice: function (key) { return active(key) && person.CanPostNotices !== false; },
      isTechnician: role === 'Technician',
      // An engineer who is a member of the area.
      isEngineerIn: function (key) { return active(key) && role === 'Engineer' && !!member[key]; },
      // "Can run meetings" in this area, set for each person and area by an administrator (spec §4).
      chairs: function (key) { return active(key) && !!member[key] && !!meetingAdmin[key]; },
      // Areas whose actions this person looks after (for the lists that gather them): management, engineers, meeting runners.
      canManage: function (key) {
        return active(key) && (management || (!!member[key] && (role === 'Engineer' || !!meetingAdmin[key])));
      },
      runsMeetings: function (key) { return active(key) && (management || (!!member[key] && !!meetingAdmin[key])); },
      // Moderating others' notices and comments: engineers of the area and management – never meeting rights alone.
      canModerate: function (key) { return active(key) && (management || (role === 'Engineer' && !!member[key])); },
      // A technician without meeting rights in the area may raise actions only for themselves (spec §4.2).
      canRaiseFor: function (key, ownerId, selfId) {
        if (!active(key) || !(management || !!member[key])) return false;
        return role !== 'Technician' || !!meetingAdmin[key] || Number(ownerId) === Number(selfId);
      }
    };
  }

  return { resolveIdentity: resolveIdentity, build: build, MESSAGES: MESSAGES };
})();
