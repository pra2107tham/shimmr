import { renderBrandImage, size, contentType, alt } from "./brand-og-image";

export { size, contentType, alt };

export default async function Image() {
  return renderBrandImage();
}
