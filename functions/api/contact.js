const MAX_MESSAGE_LENGTH = 4000;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function clean(value) {
  return String(value || "").trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function onRequestPost({ request, env }) {
  if (!env.FORMSPREE_ENDPOINT) {
    return json(
      { error: "Contact form is not configured yet." },
      { status: 500 },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, { status: 400 });
  }

  const name = clean(payload.name).slice(0, 120);
  const email = clean(payload.email).slice(0, 160);
  const message = clean(payload.message).slice(0, MAX_MESSAGE_LENGTH);
  const company = clean(payload.company);

  if (company) {
    return json({ ok: true });
  }

  if (!message) {
    return json({ error: "Please enter a message." }, { status: 400 });
  }

  if (email && !isEmail(email)) {
    return json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const sentAt = new Date().toISOString();
  const senderName = name || "Website visitor";

  const response = await fetch(env.FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      name: senderName,
      email,
      message,
      sentAt,
      _subject: `EARMATCH contact from ${senderName}`,
    }),
  });

  if (!response.ok) {
    return json({ error: "Message could not be sent." }, { status: 502 });
  }

  return json({ ok: true });
}
