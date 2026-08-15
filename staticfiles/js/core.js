function download() {
  const container = document.getElementById("capture");

  html2canvas(container).then((canvas) => {
    // Convert canvas to data URL
    const link = document.createElement("a");
    link.download = "container.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}
