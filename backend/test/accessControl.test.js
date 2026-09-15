const test = require('node:test');
const assert = require('node:assert/strict');
const { can, requireScreen, screenRoles } = require('../src/middleware/accessControl');

const expectedAccess = {
  cashier: ['sales', 'payments', 'sheet'],
  manager: ['setup', 'sales', 'payments', 'products', 'inventory', 'sheet'],
  finance: ['dashboard', 'setup', 'sales', 'payments', 'products', 'inventory', 'sheet', 'reports', 'library'],
  admin: ['dashboard', 'setup', 'sales', 'payments', 'products', 'inventory', 'sheet', 'reports', 'library', 'settings'],
  library: ['library']
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

test('somente admin gerencia vendedores e reatribuicoes da Livraria', () => {
  assert.equal(can('admin', 'library:sellers:manage'), true);
  assert.equal(can('admin', 'library:requests:reassign'), true);
  assert.equal(can('library', 'library:sellers:manage'), false);
  assert.equal(can('library', 'library:requests:reassign'), false);
  assert.equal(can('finance', 'library:sellers:manage'), false);
  assert.equal(can('finance', 'library:requests:reassign'), false);
});
