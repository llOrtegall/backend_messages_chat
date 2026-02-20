package com.backend.ortega.presentation;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.backend.ortega.domain.dto.ProductDTO;
import com.backend.ortega.domain.service.ProductService;

@RestController
public class ProductController {
    private final ProductService productService;

    public ProductController(ProductService productService){
        this.productService = productService;
    }

    @GetMapping("/products")
    public List<ProductDTO> getAllCtrl(){
        return this.productService.getAll();
    }
}
