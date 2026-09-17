const action = process.argv[2];

async function main() {
  const { ready } = require('../index');
  await ready;
  const BASE = `http://localhost:${process.env.PORT}`;

  let result;
  if (action === 'register') {
    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'persisttest', password: 'password1' }),
    });
    result = { status: res.status, body: await res.json() };
  } else if (action === 'login') {
    const res = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'persisttest', password: 'password1' }),
    });
    result = { status: res.status, body: await res.json() };
  } else {
    result = { status: 0, body: { error: 'bilinmeyen eylem' } };
  }

  process.send(result, () => process.exit(0));
}

main().catch((err) => {
  process.send({ status: 0, body: { error: err.message } }, () => process.exit(1));
});
