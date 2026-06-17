const crypto = require('crypto');

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generateTemporaryPassword(length = 12) {
  let password = '';
  while (password.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte >= PASSWORD_ALPHABET.length * Math.floor(256 / PASSWORD_ALPHABET.length)) continue;
    password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
  }
  return password;
}

module.exports = {
  generateTemporaryPassword
};
