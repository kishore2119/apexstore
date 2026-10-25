import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { productImageFallback } from '../../config/image-fallback';
import { CATALOG_PHOTOS } from '../../config/catalog-photos';

@Component({
  selector: 'app-banner-strip',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './banner-strip.component.html',
  styleUrls: ['./banner-strip.component.css'],
})
export class BannerStripComponent {
  photo(sku: string): string {
    return CATALOG_PHOTOS[sku] || '/product-placeholder.svg';
  }
  readonly imageFallback = productImageFallback;
}
