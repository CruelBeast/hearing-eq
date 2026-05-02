// ContactPage.jsx — contact route backed by a Cloudflare Pages Function

import { useState } from "react";
import { Icon } from "./icons.jsx";

export function ContactPage({ onBack }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    message: "",
    company: "",
  });
  const [status, setStatus] = useState("idle");
  const [statusText, setStatusText] = useState("");

  const updateField = (field) => (event) => {
    setStatus("idle");
    setStatusText("");
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("sending");
    setStatusText("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Message could not be sent.");
      }

      setForm({ name: "", email: "", message: "", company: "" });
      setStatus("sent");
      setStatusText("Message sent. Thanks for reaching out.");
    } catch (error) {
      setStatus("error");
      setStatusText(error.message || "Message could not be sent.");
    }
  };

  return (
    <section className="screen contact-screen">
      <div className="contact-shell">
        <div className="contact-intro">
          <div className="kicker">Contact</div>
          <h1>Send a note about EARMATCH.</h1>
          <p className="lede">
            Questions, feedback, or a bug report can go straight to Ciprian.
          </p>

          <button type="button" className="ghost contact-back" onClick={onBack}>
            <Icon.ArrowL />
            Back to the app
          </button>
        </div>

        <form className="contact-form panel" onSubmit={handleSubmit}>
          <div className="panel-h">
            <span className="panel-num">01</span>
            <span className="panel-title">Message</span>
          </div>

          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="text-input"
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Your name"
              value={form.name}
              onChange={updateField("name")}
            />
          </label>

          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="text-input"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={updateField("email")}
            />
          </label>

          <label className="field">
            <span className="field-label">Message</span>
            <textarea
              className="text-input contact-textarea"
              name="message"
              rows="7"
              placeholder="What would you like to share?"
              required
              value={form.message}
              onChange={updateField("message")}
            />
          </label>

          <label className="contact-hp" aria-hidden="true">
            <span>Company</span>
            <input
              type="text"
              name="company"
              tabIndex="-1"
              autoComplete="off"
              value={form.company}
              onChange={updateField("company")}
            />
          </label>

          <div className="contact-actions">
            <button className="cta" type="submit" disabled={status === "sending"}>
              <Icon.Mail />
              {status === "sending" ? "Sending" : "Send email"}
            </button>
          </div>

          {statusText && (
            <p className={`hint contact-status is-${status}`}>
              {statusText}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
