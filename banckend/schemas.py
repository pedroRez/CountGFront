from typing import List, Optional

from pydantic import BaseModel, Field

# BaseModel é a classe base do Pydantic para criar modelos de dados.
# Field é usado para adicionar metadados extras aos campos, como exemplos, descrições e validações.


class VideoRequest(BaseModel):
    """
    Define a estrutura esperada para o corpo da requisição POST em /predict-video/.

    English: Defines the expected structure for the POST request body at /predict-video/.
    """

    # Campo obrigatório: nome do arquivo no servidor (retornado pelo endpoint /upload-video/)
    nome_arquivo: str = Field(
        ...,  # Os três pontos indicam que este campo é obrigatório
        example="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.mp4",
        description=(
            "O nome único do arquivo de vídeo que foi previamente enviado para o servidor.\n"
            "English: The unique name of the video file that was previously uploaded to the server."
        ),
    )

    # Campo obrigatório: orientação do movimento do gado
    orientation: str = Field(
        ...,
        example="S",
        description=(
            "Orientação do movimento do gado: N, NE, E, SE, S, SW, W, NW.\n"
            "English: Orientation of cattle movement: N, NE, E, SE, S, SW, W, NW."
        ),
    )

    # Campos opcionais com valores padrão
    model_choice: Optional[str] = Field(
        default="l",
        example="l",
        description=(
            "Escolha do modelo YOLO: 'n' (nano), 'm' (médio), 'l' (grande), ou 'p' (próprio/best.pt).\n"
            "English: YOLO model choice: 'n' (nano), 'm' (medium), 'l' (large), or 'p' (own/best.pt)."
        ),
    )

    target_classes: Optional[List[str]] = Field(
        default=None,
        example=["cow"],
        description=(
            "Lista de classes alvo para contagem. Se Nulo (None), todas as classes detectadas serão contadas.\n"
            "English: List of target classes for counting. If Null (None), all detected classes will be counted."
        ),
    )

    line_position_ratio: float = Field(
        default=0.5,
        ge=0.0,  # ge = Greater than or equal to (Maior ou igual a)
        le=1.0,  # le = Less than or equal to (Menor ou igual a)
        example=0.5,
        description=(
            "Posição da linha de contagem para linhas Horizontais/Verticais (0.0 a 1.0).\n"
            "English: Counting line position for Horizontal/Vertical lines (0.0 to 1.0)."
        ),
    )


# Exemplo de como usar em video_routes.py:
# from schemas import VideoRequest
#
# @router.post("/predict-video/")
# async def predict_video_endpoint(request: VideoRequest):
#     # FastAPI usará a classe acima para validar a requisição
#     # ...
