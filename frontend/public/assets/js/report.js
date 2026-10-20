"use strict";

const reportDialog = $("report-dialog");
$("report-open").onclick = () => {
  $("report-status").textContent = "";
  $("report-mail-link").hidden = true;
  reportDialog.showModal();
  $("report-subject").focus();
};
$("report-close").onclick = () => reportDialog.close();
$("report-form").onsubmit = (event) => {
  event.preventDefault();
  const subject = $("report-subject").value.trim();
  const message = $("report-message").value.trim();
  if (subject.length < 5 || message.length < 10) {
    $("report-status").textContent =
      "Escribe un asunto de al menos 5 caracteres y una descripción de al menos 10.";
    return;
  }
  const body = [
    "Reporte de problema · SimplexLab",
    "",
    `Nombre: ${signedInUser?.name || ""}`,
    `Correo de la cuenta: ${signedInUser?.email || ""}`,
    "",
    "Descripción:",
    message,
  ].join("\r\n");
  const link = $("report-mail-link");
  link.href = `mailto:alvizures1024@gmail.com?subject=${encodeURIComponent(`SimplexLab · ${subject}`)}&body=${encodeURIComponent(body)}`;
  link.hidden = false;
  link.click();
  $("report-status").textContent =
    "Solicitamos abrir tu aplicación de correo. Revisa el mensaje y pulsa Enviar. Si no se abrió, configura una aplicación de correo y usa el enlace de abajo.";
};
