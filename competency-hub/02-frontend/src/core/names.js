// People's names for display. The directory stores names surname first ("Bloggs Jo"); addresses are
// firstname.lastname@, so the first name from the address tells us which word to move to the front.
CH.names = (function () {
  // The name a person is known by (People.KnownAs, set by an administrator) comes first; otherwise their full
  // name, first name first.
  function display(title, email, knownAs) {
    if (String(knownAs || '').trim()) return String(knownAs).trim();
    var name = String(title || '').trim();
    var local = String(email || '').split('@')[0].toLowerCase();
    var first = /^[a-z][a-z'-]*[.]/.test(local) ? local.split('.')[0] : '';
    var words = name.split(/\s+/);
    if (!first || words.length < 2) return name;
    if (words[0].toLowerCase() === first) return name;
    if (words[words.length - 1].toLowerCase() === first) return [words[words.length - 1]].concat(words.slice(0, -1)).join(' ');
    return name;
  }
  // A People row's name for display.
  function of(p) { return p ? display(p.Title, p.Email, p.KnownAs) : ''; }
  // "Joe's", "James'"
  function possessive(name) { return /s$/i.test(name) ? name + '\'' : name + '\'s'; }
  return { display: display, of: of, possessive: possessive };
})();
