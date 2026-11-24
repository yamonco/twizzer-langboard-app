const status = document.querySelector("#status");
document.querySelector("#connect").addEventListener("click", () => {
  status.textContent = "The host opens Langboard native OAuth. Twizzer never collects a Langboard password.";
});
