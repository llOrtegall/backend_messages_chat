package com.backend.ortega.persistence;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.backend.ortega.domain.dto.ProductDTO;
import com.backend.ortega.domain.repository.ProductRepositoryImplementation;
import com.backend.ortega.persistence.crud.CrudProductEntity;
import com.backend.ortega.persistence.mapper.ProductMapper;

@Repository
public class ProductEntityRepository implements ProductRepositoryImplementation{

    private final CrudProductEntity crudProduct;
    private final ProductMapper productMapper;

    public ProductEntityRepository (CrudProductEntity crudProduct, ProductMapper productMapper){
        this.crudProduct = crudProduct;
        this.productMapper = productMapper;
    }

    @Override
    public List<ProductDTO> findAllProducts() {
        return this.productMapper.toDtos(this.crudProduct.findAll());
    }

}
