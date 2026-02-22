package com.backend.ortega.persistence.mapper;

import java.util.List;

import org.mapstruct.InheritInverseConfiguration;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

import com.backend.ortega.domain.dto.ProductDTO;
import com.backend.ortega.persistence.entities.ProductEntity;

@Mapper(componentModel = "spring")
public interface ProductMapper {
    
    @Mapping(source = "name", target = "nombre")
    @Mapping(source = "description", target = "descripcion")
    @Mapping(source = "price", target = "precio")
    ProductDTO toDto(ProductEntity entity);
    List<ProductDTO> toDtos(Iterable<ProductEntity> entities);
    @InheritInverseConfiguration
    ProductEntity toEntity(ProductDTO dto);
    @InheritInverseConfiguration
    @Mapping(target = "id", ignore = true)
    void updateEntityFromDto(ProductDTO productDTO, @MappingTarget ProductEntity productEntity);
}
