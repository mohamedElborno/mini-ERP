export function waitForPrintAssets(): Promise<void> {
  const images = Array.from(document.images);
  const imagePromise =
    images.length === 0
      ? Promise.resolve()
      : Promise.all(
          images.map(
            (image) =>
              new Promise<void>((resolve) => {
                if (image.complete && image.naturalWidth > 0) {
                  resolve();
                  return;
                }

                const finish = () => resolve();
                image.addEventListener("load", finish, { once: true });
                image.addEventListener("error", finish, { once: true });
              }),
          ),
        ).then(() => undefined);

  const qrPromise = new Promise<void>((resolve) => {
    const deadline = Date.now() + 4000;

    const check = () => {
      const blocks = document.querySelectorAll(".doc-qr-block");
      if (blocks.length === 0) {
        resolve();
        return;
      }

      const allReady = Array.from(blocks).every(
        (block) => block.querySelector("svg") !== null,
      );
      if (allReady || Date.now() > deadline) {
        resolve();
        return;
      }

      requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  });

  return Promise.all([imagePromise, qrPromise]).then(() => {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}
