function alertAndThrow(msg) {
  alert(msg);
  throw Error(msg);
}

function findInArrayCaseInsensitive(arr, v) {
  let v_regex = new RegExp('^' + v + '$', 'i');
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].match(v_regex)) {
      return arr[i];
    }
  }
  return null;
}

function urlSafeBase64Encode(s) {
  return btoa(s).replace(/=/g, '').replace(/\+/g, '.').replace(/\//g, '_');
}

function urlSafeBase64Decode(s) {
  s = s.replace(/\./g, '+').replace(/_/, '/');
  if (s.length % 4 != 0) {
    s += '='.repeat(4 - (s.length % 4));
  }
  return atob(s);
}
