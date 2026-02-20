package com.backend.ortega.domain.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.backend.ortega.domain.dto.ProductDTO;
import com.backend.ortega.domain.repository.ProductRepositoryImplementation;

@Service
public class ProductService {
    private final ProductRepositoryImplementation productRepo;

    public ProductService(ProductRepositoryImplementation productRepo){
        this.productRepo = productRepo;
    }

    public List<ProductDTO> getAll(){
        return this.productRepo.findAllProducts();
    }

}
