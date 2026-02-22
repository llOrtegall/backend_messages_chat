package com.backend.ortega.domain.repository;

import java.util.List;

import com.backend.ortega.domain.dto.ProductDTO;

public interface ProductRepositoryImplementation {
    List<ProductDTO> findAllProducts();
    ProductDTO findById(Long id);
    ProductDTO save(ProductDTO product);
    ProductDTO update(Long id, ProductDTO updated);
}
