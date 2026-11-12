// CORS para el Chromecast y el front: permite Range y expone los headers que el reproductor necesita.

export function cors(origins = ['*']) {
  const any = origins.includes('*');
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (any) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
    }
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges, Content-Type',
    );
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, X-Profile-Token');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }
    next();
  };
}
