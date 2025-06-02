async function verifyHealth(req, res) {
  try {
    res.status(200).json({ status: 'ok', message: 'Backend rodando' });
  } catch (err) {
    console.error('Erro no health check:', err);
    res.status(500).json({ status: 'fail', error: 'Backend com problemas' });
  }
}

module.exports = { verifyHealth };