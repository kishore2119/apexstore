package com.ecom.product;

import com.ecom.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import java.io.*;
import java.nio.file.*;
import java.util.UUID;

@RestController
public class ProductImages {
    private final Path directory;
    public ProductImages(@Value("${app.upload-directory:.local/uploads/products}") String directory) {
        this.directory=Path.of(directory).toAbsolutePath().normalize();
    }
    public record Uploaded(String imageUrl) {}

    @PostMapping(value={"/api/seller/products/images","/api/admin/products/images"},consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SELLER','ADMIN') and (!#request.servletPath.startsWith('/api/admin') or hasRole('ADMIN'))")
    public Uploaded upload(jakarta.servlet.http.HttpServletRequest request,@RequestParam MultipartFile file) {
        if(file.isEmpty() || file.getSize()>5*1024*1024) throw ApiException.bad("Choose a JPG or PNG image smaller than 5 MB");
        try(var stream=ImageIO.createImageInputStream(file.getInputStream())) {
            var readers=ImageIO.getImageReaders(stream);
            if(!readers.hasNext()) throw ApiException.bad("The file is not a valid JPG or PNG image");
            var reader=readers.next();
            try {
                reader.setInput(stream);
                String format=reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
                if(!format.equals("jpeg") && !format.equals("png")) throw ApiException.bad("Only JPG and PNG images are supported");
                int width=reader.getWidth(0),height=reader.getHeight(0);
                if(width<1 || height<1 || width>6000 || height>6000 || (long)width*height>16000000) throw ApiException.bad("Image dimensions must be within 6000 pixels and 16 megapixels");
                String extension=format.equals("jpeg")?"jpg":"png";
                String filename=UUID.randomUUID()+"."+extension;
                Files.createDirectories(directory);
                // Re-encode raster pixels; client filenames and embedded metadata are not saved.
                if(!ImageIO.write(reader.read(0),extension,directory.resolve(filename).toFile())) throw new IOException("Image encoding failed");
                return new Uploaded("/api/products/images/"+filename);
            } finally { reader.dispose(); }
        } catch(IOException e) { throw ApiException.bad("Could not read or save this image. Choose a valid JPG or PNG and try again"); }
    }

    @GetMapping("/api/products/images/{filename}")
    public ResponseEntity<FileSystemResource> image(@PathVariable String filename) {
        if(!filename.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.(png|jpg)")) throw ApiException.missing("Image");
        Path path=directory.resolve(filename).normalize();
        if(!path.startsWith(directory) || !Files.isRegularFile(path)) throw ApiException.missing("Image");
        return ResponseEntity.ok().contentType(filename.endsWith(".png")?MediaType.IMAGE_PNG:MediaType.IMAGE_JPEG)
            .header("X-Content-Type-Options","nosniff").cacheControl(CacheControl.maxAge(java.time.Duration.ofDays(30)))
            .body(new FileSystemResource(path));
    }
}
