const test = require('node:test');
const assert = require('node:assert/strict');
const { requireScreen, screenRoles } = require('../src/middleware/accessControl');

const expectedAccess = {
  cashier: ['sales', 'sheet'],
  manager: ['setup', 'sales', 'products', 'inventory', 'sheet'],
  admin: ['dashboard', 'setup', 'sales', 'products', 'inventory', 'sheet', 'reports', 'settings']
};

function checkAccess(screen, role) {
  let nextCalled = false;
  let statusCode = null;
  let payload = null;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    }
  };

  requireScreen(screen)({ user: { role } }, response, () => {
    nextCalled = true;
  });

  return { nextCalled, statusCode, payload };
}

test('matriz de acesso das telas corresponde aos perfis definidos', () => {
  Object.entries(expectedAccess).forEach(([role, screens]) => {
    Object.keys(screenRoles).forEach((screen) => {
      const result = checkAccess(screen, role);
      assert.equal(result.nextCalled, screens.includes(screen), `${role} em ${screen}`);
      assert.equal(result.statusCode, screens.includes(screen) ? null : 403, `${role} status em ${screen}`);
    });
  });
});
