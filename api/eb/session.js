export default function handler(_req, res) {
  return res.status(410).json({
    error: 'Endpoint rimosso: lo scambio del codice avviene nel callback protetto.',
  })
}
