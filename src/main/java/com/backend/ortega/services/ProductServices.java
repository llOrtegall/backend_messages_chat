package com.backend.ortega.services;

import com.backend.ortega.entities.Product;

import java.util.List;
import java.util.Optional;

public interface ProductServices {
    List<Product> findAll();
    Optional<Product> findById(Long id);
    Product save(Product product);
    void deleteById(Long id);
}
