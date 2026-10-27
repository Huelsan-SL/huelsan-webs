"use strict";
const $ = s => document.querySelector(s);
const msg = (t, bad) => { $("#msg").textContent = t || ""; $("#msg").style.color = bad ? "#b42318" : ""; };
const send = m => chrome.runtime.sendMessage(m);
async function pintar() {
  const i = await send({ tipo: "info" });
  $("#v-login").hidden = !!i.email; $("#v-main").hidden = !i.email;
  if (i.email) { $("#quien").textContent = "Conectado como " + i.email; $("#auto").checked = i.auto; $("#hora").value = i.hora; }
  if (i.job && !i.job.terminado) msg("Hay una recogida en marcha.");
}
$("#f-login").addEventListener("submit", async e => {
  e.preventDefault(); msg("Entrando…");
  const r = await send({ tipo: "login", email: $("#email").value.trim(), password: $("#pass").value });
  $("#pass").value = "";
  if (r && r.ok) { msg(""); pintar(); } else msg(r && r.msg ? "No se ha podido entrar: " + r.msg : "No se ha podido entrar.", true);
});
$("#b-recoger").onclick = async () => { const r = await send({ tipo: "recoger", origen: "popup" }); msg(r.msg, !r.ok); };
$("#b-bca").onclick = async () => { const r = await send({ tipo: "abrir-bca" }); msg(r.msg, !r.ok); };
const guardarAuto = async () => { await send({ tipo: "auto", auto: $("#auto").checked, hora: $("#hora").value }); msg($("#auto").checked ? "Recogida diaria activada a las " + $("#hora").value : "Recogida diaria desactivada"); };
$("#auto").onchange = guardarAuto; $("#hora").onchange = guardarAuto;
$("#b-salir").onclick = async () => { await send({ tipo: "logout" }); pintar(); };
pintar();
