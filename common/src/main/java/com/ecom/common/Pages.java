package com.ecom.common;
import org.springframework.data.domain.*;
import java.util.*;
public final class Pages {
    private Pages() {}
    public static Pageable of(int page,int size,String sort,Set<String> allowed) {
        if (page < 0 || size < 1 || size > 100) throw ApiException.bad("page must be nonnegative and size must be 1–100");
        if ((long) page * size > Integer.MAX_VALUE) throw ApiException.bad("Requested page exceeds the supported range");
        String[] parts = sort.split(",",-1);
        if(parts.length != 2 || !allowed.contains(parts[0]) || !Set.of("asc","desc").contains(parts[1])) throw ApiException.bad("Unsupported sort; use field,asc or field,desc");
        return PageRequest.of(page,size,Sort.by(Sort.Direction.fromString(parts[1]),parts[0]).and(Sort.by("id")));
    }
    public record Result<T>(List<T> content,int page,int size,long totalElements,int totalPages) {
        public static <T> Result<T> from(Page<T> p) { return new Result<>(p.getContent(),p.getNumber(),p.getSize(),p.getTotalElements(),p.getTotalPages()); }
    }
}
