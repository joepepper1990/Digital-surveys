// People's names for display. The directory stores names surname first ("Pepper Joseph"); addresses are
// firstname.lastname@, so the first name from the address tells us which word to move to the front.
CH.names = (function () {
  function display(title, email) {
    var name = String(title || '').trim();
    var local = String(email || '').split('@')[0].toLowerCase();
    var first = /^[a-z][a-z'-]*[.]/.test(local) ? local.split('.')[0] : '';
    var words = name.split(/\s+/);
    if (!first || words.length < 2) return name;
    if (words[0].toLowerCase() === first) return name;
    if (words[words.length - 1].toLowerCase() === first) return [words[words.length - 1]].concat(words.slice(0, -1)).join(' ');
    return name;
  }
  return { display: display };
})();
