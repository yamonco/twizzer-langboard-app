const status = document.querySelector("#status");
document.querySelector("#connect").addEventListener("click", () => {
  status.textContent = "The host opens Langboard native OAuth. Goldenbase never collects a Langboard password.";
});
