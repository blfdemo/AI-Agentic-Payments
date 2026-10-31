/* Login + Sign-up behaviour (demo auth, state kept in localStorage).
   Forms carry no validation: whatever is typed (or not) simply continues. */
(function () {
  AP.bindReveal();
  if (AP.session() && !location.search.includes("force")) { AP.goAfterAuth(); return; }

  const sso = (provider) => {
    AP.toast("Connecting to " + provider + "…", "ok");
    setTimeout(() => { AP.login("demo." + provider.toLowerCase() + "@agentpay.io", "Demo User"); AP.goAfterAuth(); }, 900);
  };
  AP.$$("[data-sso]").forEach((b) => (b.onclick = () => sso(b.dataset.sso)));

  /* ---------- login ---------- */
  const lf = AP.$("#loginForm");
  if (lf) {
    AP.$("#demoFill").onclick = (e) => { e.preventDefault(); AP.$("#email").value = "demo@agentpay.io"; AP.$("#password").value = "Agent@123"; };
    lf.onsubmit = (e) => {
      e.preventDefault();
      const em = AP.$("#email").value.trim() || "demo@agentpay.io";
      const btn = AP.$("#loginBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in…';
      setTimeout(() => { AP.login(em); AP.goAfterAuth(); }, 800);
    };
    AP.$("#forgotSend").onclick = () => {
      const v = AP.$("#forgotEmail").value.trim();
      bootstrap.Modal.getInstance(AP.$("#forgotModal")).hide(); AP.toast("Reset link sent" + (v ? " to " + v : ""), "ok");
    };
  }

  /* ---------- sign up ---------- */
  const sf = AP.$("#signupForm");
  if (sf) {
    sf.onsubmit = (e) => {
      e.preventDefault();
      const name = AP.$("#name").value.trim(), email = AP.$("#email").value.trim() || "demo@agentpay.io";
      const s = AP.load(); s.user = { name, email, pw: btoa(AP.$("#password").value), onboarded: false, useCase: null, avatar: s.user.avatar || "user-01" }; AP.save();
      const btn = sf.querySelector("button[type=submit]"); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating account…';
      setTimeout(() => { AP.login(email, name); AP.toast("Account created", "ok"); location.href = "onboarding.html"; }, 900);
    };
  }
})();
