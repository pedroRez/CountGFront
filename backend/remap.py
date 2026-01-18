import glob
import logging
import os

logger = logging.getLogger(__name__)


def remap_class_ids(
    input_labels_dir, output_labels_dir, class_mapping, new_class_id_gado
):
    """
    Remapeia IDs de classe em arquivos de anotação YOLO.

    Args:
        input_labels_dir (str): Diretório contendo os arquivos .txt de anotações originais.
        output_labels_dir (str): Diretório onde os arquivos .txt modificados serão salvos.
        class_mapping (dict): Dicionário mapeando IDs de classe COCO antigos para o novo ID de "gado".
                               Ex: {16: 0, 17: 0, 20: 0} onde 0 é o novo ID para "gado".
                                   Isso significa que 'cow' (16), 'horse' (17), 'elephant' (20)
                                   serão todos remapeados para a classe 0 ('gado').
        new_class_id_gado (int): O ID numérico para a sua nova classe "gado" (geralmente 0).
    """
    if not os.path.exists(output_labels_dir):
        os.makedirs(output_labels_dir)
        logger.info(f"Diretório de saída criado: {output_labels_dir}")

    # Lista de IDs de classe COCO que devem ser convertidos para new_class_id_gado
    # Se class_mapping já contém o mapeamento direto, esta lista pode não ser necessária,
    # mas o dicionário é mais flexível se diferentes classes antigas mapearem para diferentes novas classes.
    # Para o seu caso: queremos que várias classes COCO (cow, horse, elephant) se tornem 'gado' (ID 0).
    # E também, se "cow" (ID 16) já é detectado, queremos que ele se torne "gado" (ID 0).

    coco_ids_to_remap = set(class_mapping.keys())

    num_files_processed = 0
    num_detections_remapped = 0

    for label_file_path in glob.glob(os.path.join(input_labels_dir, "*.txt")):
        base_filename = os.path.basename(label_file_path)
        output_file_path = os.path.join(output_labels_dir, base_filename)

        modified_lines = []
        file_had_remap = False

        with open(label_file_path, "r") as f_in:
            for line in f_in:
                parts = line.strip().split()
                if not parts:
                    continue

                try:
                    original_class_id = int(parts[0])
                    coords = parts[1:]  # x_center, y_center, width, height, [conf]

                    if original_class_id in coco_ids_to_remap:
                        # Remapeia para o new_class_id_gado
                        modified_lines.append(f"{new_class_id_gado} {' '.join(coords)}")
                        num_detections_remapped += 1
                        file_had_remap = True
                    else:
                        # Mantém a linha original se a classe não está no mapa de remapeamento
                        # Ou você pode optar por descartar classes não mapeadas, se desejar.
                        # Por agora, vamos manter:
                        # modified_lines.append(line.strip()) # Mantém original se não mapeado
                        # OU, se você só quer a classe gado no final, descarte outros:
                        pass  # Descarta detecções de classes não mapeadas

                except ValueError:
                    logger.warning(
                        f"Aviso: Linha mal formatada em {label_file_path}: {line.strip()}"
                    )
                    modified_lines.append(line.strip())  # Mantém linha mal formatada

        if (
            modified_lines
        ):  # Salva o arquivo apenas se houver linhas (após descarte ou com modificações)
            with open(output_file_path, "w") as f_out:
                for mod_line in modified_lines:
                    f_out.write(mod_line + "\n")

        if file_had_remap:
            # print(f"Arquivo processado e remapeado: {base_filename}")
            pass
        num_files_processed += 1

    logger.info("Processamento concluído.")
    logger.info(f"Total de arquivos de anotação verificados: {num_files_processed}")
    logger.info(
        f"Total de detecções individuais remapeadas para ID '{new_class_id_gado}': {num_detections_remapped}"
    )
    logger.info(f"Arquivos modificados salvos em: {output_labels_dir}")


if __name__ == "__main__":
    # --- Configuração ---
    # 1. Diretório com os labels .txt gerados pelo 'yolo predict' (ex: runs/detect/expN/labels/)
    INPUT_LABELS_DIRECTORY = "caminho/para/runs/detect/expN/labels/"

    # 2. Diretório onde os labels .txt corrigidos serão salvos
    OUTPUT_LABELS_DIRECTORY = "caminho/para/seu_dataset_corrigido/labels/"

    # 3. ID da sua nova classe "gado" (geralmente 0 para a primeira classe no seu data.yaml)
    NEW_GADO_CLASS_ID = 0

    # 4. Mapeamento: Quais IDs de classe do COCO (detectados pelo yolov8l.pt)
    #    devem ser convertidos para o seu NEW_GADO_CLASS_ID.
    #    Verifique os IDs corretos do COCO para 'cow', 'horse', 'elephant'.
    #    Comum: cow=16, horse=17, elephant=20. CONFIRME ESSES VALORES para o seu modelo.
    #    Se o seu modelo yolov8l.pt padrão está carregado, model.names lhe dará os IDs.
    COCO_CLASS_MAPPING_TO_GADO = {
        16: NEW_GADO_CLASS_ID,  # cow -> gado
        17: NEW_GADO_CLASS_ID,  # horse -> gado
        20: NEW_GADO_CLASS_ID,  # elephant -> gado
        # Adicione outros IDs do COCO que você quer converter para "gado"
        # Ex: Se ele confunde com 'sheep' (ovelha, ID 18 no COCO), adicione:
        # 18: NEW_GADO_CLASS_ID,
    }
    # --- Fim da Configuração ---

    # Validação básica dos caminhos
    if (
        not os.path.isdir(INPUT_LABELS_DIRECTORY)
        or INPUT_LABELS_DIRECTORY == "caminho/para/runs/detect/expN/labels/"
    ):
        logger.error(
            f"ERRO: O diretório de entrada '{INPUT_LABELS_DIRECTORY}' não existe ou não foi alterado. Por favor, configure corretamente."
        )
    elif OUTPUT_LABELS_DIRECTORY == "caminho/para/seu_dataset_corrigido/labels/":
        logger.warning(
            f"AVISO: O diretório de saída '{OUTPUT_LABELS_DIRECTORY}' parece não ter sido alterado do exemplo. Verifique se está correto."
        )
        remap_class_ids(
            INPUT_LABELS_DIRECTORY,
            OUTPUT_LABELS_DIRECTORY,
            COCO_CLASS_MAPPING_TO_GADO,
            NEW_GADO_CLASS_ID,
        )
    else:
        remap_class_ids(
            INPUT_LABELS_DIRECTORY,
            OUTPUT_LABELS_DIRECTORY,
            COCO_CLASS_MAPPING_TO_GADO,
            NEW_GADO_CLASS_ID,
        )

    logger.info(
        "Lembre-se de copiar as IMAGENS correspondentes para o seu diretório de dataset final e criar o arquivo data.yaml!"
    )
    logger.info(
        f"Seu data.yaml deve ter nc: 1 e names: ['gado'] (ou o nome que você escolheu para a classe ID {NEW_GADO_CLASS_ID})."
    )
