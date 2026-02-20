package com.backend.ortega.services;

import com.backend.ortega.entities.Product;
import com.backend.ortega.repositories.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class ProductServiceImple implements ProductServices{
    final private ProductRepository productRepo;

    public ProductServiceImple(ProductRepository productRepo) {
        this.productRepo = productRepo;
    }

    @Transactional(readOnly = true)
    @Override
    public List<Product> findAll() {
        return  (List<Product>) productRepo.findAll();
    }

    @Transactional(readOnly = true)
    @Override
    public Optional<Product> findById(Long id) {
        return productRepo.findById(id);
    }

    @Override
    public Product save(Product product) {
        return productRepo.save(product);
    }

    @Transactional()
    @Override
    public void deleteById(Long id) {
        Optional<Product> product = productRepo.findById(id);
        if(product.isPresent()) {
            productRepo.deleteById(id);
        }
    }
}
