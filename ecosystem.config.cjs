module.exports = {
  apps: [
    {
      name: 'lanchonete-backend',
      cwd: './backend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: '4000'
      }
    },
    {
      name: 'lanchonete-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run preview -- --host 0.0.0.0 --port 4173',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
