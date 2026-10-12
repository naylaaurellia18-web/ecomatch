const { app, boot } = require('./app');

const PORT = process.env.PORT || 3000;

boot()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`EcoMatch berjalan di http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Gagal start:', e);
    process.exit(1);
  });
