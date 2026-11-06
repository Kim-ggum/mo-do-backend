'use strict';
// 로그인·회원가입 화면

/* ---------- 준비 ---------- */

// 로그인 후 돌아갈 주소 (?next=/c/abc). 다른 사이트로 보내지 않도록 우리 사이트 경로만 허용합니다
const rawNext = new URLSearchParams(location.search).get("next") || "/";
const next = /^\/(?!\/)/.test(rawNext) ? rawNext : "/";

const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "moa" }, body: JSON.stringify(body) });

// 이미 로그인돼 있으면 바로 앱으로
fetch("/api/me").then(r => r.json()).then(d => { if (d.user) location.replace(next); });

// 입학 연도: 올해부터 8년 전까지
const yearSelect = document.getElementById("su-entry"), thisYear = new Date().getFullYear();
for (let y = thisYear; y > thisYear - 8; y--) yearSelect.add(new Option(`${y}년`, y));

document.getElementById("forgot").onclick = e => { e.preventDefault(); toast("비밀번호 재설정은 운영자에게 문의해 주세요."); };

/* ---------- 탭 (로그인 / 회원가입) ---------- */

const copy = {
  login:  { title: "다시 오셨네요", sub: "이메일로 로그인하고 기록을 이어가세요." },
  signup: { title: "MoA 시작하기", sub: "계정을 만들고 첫 기록을 남겨보세요." },
};

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.tab === name));
  document.querySelectorAll("form").forEach(f => f.classList.toggle("active", f.id === name));
  document.getElementById("title").textContent = copy[name].title;
  document.getElementById("subtitle").textContent = copy[name].sub;
  document.querySelectorAll(".field.invalid").forEach(f => f.classList.remove("invalid"));
}
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => switchTab(b.dataset.go));

/* ---------- 입력 도우미 ---------- */

// 비밀번호 보기/숨기기
document.querySelectorAll(".pw-toggle").forEach(btn => {
  btn.onclick = () => {
    const input = btn.previousElementSibling;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "숨기기" : "보기";
  };
});

// 서버와 같은 규칙으로 미리 검사합니다 (src/lib/validate.js)
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isStrongPw = v => v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v);

/** 칸 아래에 오류 문구를 보이거나 숨깁니다. ok를 그대로 돌려줍니다 */
function mark(input, ok) {
  input.closest(".field").classList.toggle("invalid", !ok);
  return ok;
}
// 입력 중이면 에러 표시 해제
document.querySelectorAll(".field input").forEach(i =>
  i.addEventListener("input", () => i.closest(".field").classList.remove("invalid"))
);

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- 로그인 ---------- */

document.getElementById("login").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("login-email");
  const pw = document.getElementById("login-pw");
  const ok = [mark(email, isEmail(email.value.trim())), mark(pw, pw.value.length > 0)].every(Boolean);
  if (!ok) return;

  const res = await post("/api/auth/login", { email: email.value.trim(), password: pw.value, remember: document.getElementById("login-remember").checked });
  if (!res.ok) return toast((await res.json()).error);
  location.href = next;
});

/* ---------- 회원가입 ---------- */

// 약관에 동의해야 가입 버튼이 켜집니다
const agree = document.getElementById("su-agree");
const suBtn = document.getElementById("su-btn");
agree.onchange = () => (suBtn.disabled = !agree.checked);

document.getElementById("signup").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("su-name");
  const email = document.getElementById("su-email");
  const pw = document.getElementById("su-pw");
  const pw2 = document.getElementById("su-pw2");
  const ok = [
    mark(name, name.value.trim().length > 0),
    mark(email, isEmail(email.value.trim())),
    mark(pw, isStrongPw(pw.value)),
    mark(pw2, pw2.value.length > 0 && pw.value === pw2.value),
  ].every(Boolean);
  if (!ok) return;

  const res = await post("/api/auth/signup", { name: name.value.trim(), email: email.value.trim(), password: pw.value, entry: Number(document.getElementById("su-entry").value) });
  if (res.status === 409) { mark(email, false); return toast("이미 가입된 이메일이에요."); }
  if (!res.ok) return toast((await res.json()).error);
  toast("가입이 완료됐어요. 로그인해 주세요.");
  switchTab("login");
  document.getElementById("login-email").value = email.value.trim();
});
