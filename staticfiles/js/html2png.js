async function captureAndDownload(selector) {
    const element = document.querySelector(selector);

    // 1. Validation Check (Fixes your "Invalid element" error)
    if (!element) {
        console.error(`Source element "${selector}" not found in the DOM.`);
        alert(`Error: Could not find ${selector}`);
        return;
    }

    try {
        // 2. Options optimized for Bootstrap
        const options = {
            scale: 2,             // Higher quality (Retina)
            useCORS: true,        // Load external Bootstrap icons/images
            allowTaint: false,    // Security setting for cross-origin images
            backgroundColor: "#ffffff", // Bootstrap elements often have transparent bgs
            logging: false
        };

        // 3. Generate Canvas
        const canvas = await html2canvas(element, options);

        // 4. Download Logic
        const link = document.createElement('a');
        link.href = canvas.toDataURL("image/png");
        link.download = `export-${Date.now()}.png`;
        link.click();

    } catch (err) {
        console.error("Capture failed:", err);
    }
}

async function downloadBootstrapWithDomToImage(selector, fileName = 'screenshot.png') {
    const node = document.querySelector(selector);
    if (!node) return console.error("Target not found");

    // 1. Activate Export Mode
    node.classList.add('export-mode');

    // 2. High-Res Setup
    const scale = 2;
    const options = {
        width: node.clientWidth * scale,
        height: node.clientHeight * scale,
        style: {
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: node.clientWidth + "px",
            height: node.clientHeight + "px"
        },
        bgcolor: '#ffffff'
    };

    try {
        // 3. CRITICAL: Wait for the browser to render the new CSS gradient bar
        await new Promise(resolve => requestAnimationFrame(() => {
            setTimeout(resolve, 200); 
        }));

        // 4. Capture
        const dataUrl = await domtoimage.toPng(node, options);

        // 5. Download
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        link.click();

    } catch (error) {
        console.error("PNG Generation Error:", error);
    } finally {
        // 6. Cleanup
        node.classList.remove('export-mode');
    }
}