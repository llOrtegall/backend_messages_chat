package com.backend.ortega.persistence.crud;

import org.springframework.data.repository.CrudRepository;

import com.backend.ortega.persistence.entities.ProductEntity;

public interface CrudProductEntity extends CrudRepository<ProductEntity, Long>{

}
